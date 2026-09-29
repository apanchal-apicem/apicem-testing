from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .config import settings

DATABASE_URL = (
    f"postgresql+psycopg2://{settings.apicem_app_db_user}:{settings.apicem_app_db_password}"
    f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def set_tenant(db, tenant_id):
    """Scopes every subsequent statement in the current transaction to one tenant via
    Postgres RLS (doc Sec 6.2). SET LOCAL only lasts for the current transaction, which
    matches a request's session lifecycle here."""
    db.execute(text("SET LOCAL app.current_tenant = :tenant_id"), {"tenant_id": str(tenant_id)})


def set_current_user(db, user_id):
    """Companion to set_tenant: some tables need to be readable by a scope narrower than
    "everyone in the active tenant" -- app.workspace_memberships is the first one, since a
    user must see their OWN memberships across every workspace they belong to (for the
    workspace switcher), not just memberships within the currently active tenant. RLS
    policies on those tables key off this session variable in addition to app.current_tenant.
    Named app.current_user_id, not app.current_user -- Postgres reserves "current_user" as a
    keyword/builtin function, which a custom GUC of that exact name collides with at parse
    time ("syntax error at or near current_user"), confirmed live."""
    db.execute(text("SET LOCAL app.current_user_id = :user_id"), {"user_id": str(user_id)})
