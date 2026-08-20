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
