from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..assistant_tools import ask_assistant
from ..schemas import AssistantAskRequest, AssistantAskResponse
from ..security import CurrentUser, get_current_user, get_tenant_db

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/ask", response_model=AssistantAskResponse)
def ask(
    payload: AssistantAskRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    history = [{"role": m.role, "content": m.content} for m in payload.history]
    try:
        reply = ask_assistant(db, current_user.tenant_id, payload.message, history)
    except RuntimeError as exc:
        # ask_assistant raises RuntimeError with an already-user-facing message (Ollama
        # unreachable/timed out/erroring) -- a 503 since the failure is the local AI
        # service being unavailable, not a bad request.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return AssistantAskResponse(reply=reply)
