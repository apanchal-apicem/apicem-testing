import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..assistant_intents import ask_assistant, build_capabilities
from ..schemas import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantCapabilityCategory,
    AssistantMessageOut,
)
from ..security import CurrentUser, get_current_user, get_tenant_db

router = APIRouter(prefix="/assistant", tags=["assistant"])

# How much of a user's own chat history to load back -- generous enough that "scroll up" feels
# complete for normal use, bounded so the page never has to render an unbounded transcript.
HISTORY_LIMIT = 200


@router.get("/capabilities", response_model=list[AssistantCapabilityCategory])
def capabilities(current_user: CurrentUser = Depends(get_current_user)):
    return build_capabilities()


@router.get("/history", response_model=list[AssistantMessageOut])
def history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    # Per-user, not shared across the tenant's team -- RLS (tenant_isolation) already scopes
    # this to the tenant, this adds the finer-grained user_id filter on top (defense in depth,
    # same convention as every tenant-scoped query in this app explicitly re-checking tenant_id
    # even though RLS also enforces it).
    rows = db.execute(
        text(
            """SELECT message_id, role, content, results, created_at
               FROM app.assistant_messages
               WHERE user_id = :user_id
               ORDER BY created_at DESC
               LIMIT :limit"""
        ),
        {"user_id": current_user.user_id, "limit": HISTORY_LIMIT},
    ).all()
    messages = [
        AssistantMessageOut(
            message_id=str(row.message_id),
            role=row.role,
            content=row.content,
            results=row.results or [],
            created_at=row.created_at,
        )
        for row in rows
    ]
    messages.reverse()  # oldest first, matching how the chat renders top to bottom
    return messages


@router.delete("/history", status_code=204)
def clear_history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    db.execute(
        text("DELETE FROM app.assistant_messages WHERE user_id = :user_id"),
        {"user_id": current_user.user_id},
    )
    db.commit()


def _save_message(db: Session, tenant_id: str, user_id: str, role: str, content: str, results: list[dict]):
    db.execute(
        text(
            """INSERT INTO app.assistant_messages (tenant_id, user_id, role, content, results)
               VALUES (:tenant_id, :user_id, :role, :content, CAST(:results AS jsonb))"""
        ),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": role,
            "content": content,
            "results": json.dumps(results) if results else None,
        },
    )


@router.post("/ask", response_model=AssistantAskResponse)
def ask(
    payload: AssistantAskRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    # Deterministic phrase matching (assistant_intents.py) is the primary path; an optional
    # Groq classifier only ever kicks in as a last resort when nothing else matched (still
    # never lets an LLM state a number or word a reply -- see that module's docstring).
    # No full conversation history is needed to ANSWER the question (every question is
    # answered fresh from its own words, plus optionally the single last-answer context below
    # for a bare follow-up) -- but both sides of the exchange are saved below so the chat
    # transcript itself survives a refresh, a nav away, or logging back in later.
    outcome = ask_assistant(
        db,
        current_user.tenant_id,
        payload.message,
        previous_metric=payload.previous_metric,
        previous_start_date=payload.previous_start_date,
        previous_end_date=payload.previous_end_date,
        is_demo=current_user.is_demo,
    )
    _save_message(db, current_user.tenant_id, current_user.user_id, "user", payload.message, [])
    _save_message(db, current_user.tenant_id, current_user.user_id, "assistant", outcome["reply"], outcome["results"])
    db.commit()
    return AssistantAskResponse(reply=outcome["reply"], results=outcome["results"])
