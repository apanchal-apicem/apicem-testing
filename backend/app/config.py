import os

from pydantic_settings import BaseSettings

# Resolves to the repo root's .env regardless of the process's current working directory --
# pydantic-settings' env_file is otherwise resolved relative to CWD, which silently never
# matched when uvicorn is launched from backend/ against a .env that lives one level up.
_REPO_ROOT_ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")


class Settings(BaseSettings):
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "apicem"

    # The backend connects ONLY as the restricted apicem_app role -- never as the table
    # owner -- so Postgres always subjects it to RLS (doc Sec 6.2, 11).
    apicem_app_db_user: str = "apicem_app"
    apicem_app_db_password: str = "apicem_app_dev_password"

    jwt_secret: str = "change_me_dev_only"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24

    # Used to envelope-encrypt connection credentials before they're stored in app.secrets
    # (doc Sec 2.2, 11). Real deployments should use AWS Secrets Manager/Vault instead.
    fernet_key: str = ""

    password_reset_token_expires_minutes: int = 30

    # /auth/demo issues a real token for this fixed, pre-seeded account with no credentials
    # required -- the "View live demo" button on the public homepage. Its role is always
    # "viewer" (see warehouse seeding), so require_role("owner", "admin") already blocks it
    # from touching connections/team/workspace settings -- no separate read-only mode needed.
    demo_user_email: str = "demo@apicem-demo.com"

    # Blank host = log the email to the backend's own console instead of sending (dev
    # fallback -- see .env.example). Fill in once a real provider is configured.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "onboarding@apicem.local"

    # Blank = the Groq last-resort intent classifier in assistant_intents.py/groq_fallback.py
    # is entirely disabled -- no outbound call is ever attempted. It only ever CLASSIFIES a
    # question into one of this app's own already-defined metric/date keys (validated against
    # them before use); it never sees or states a number, so keeping this optional doesn't
    # weaken the "no LLM ever answers directly" guarantee the rest of the assistant relies on.
    groq_api_key: str = ""
    # Confirmed available via Groq's /v1/models as of 2026-09-07 -- Groq's catalog has shifted
    # entirely away from Llama 3.x models since; check `GET /v1/models` again if this 404s.
    groq_model: str = "openai/gpt-oss-20b"

    class Config:
        env_file = _REPO_ROOT_ENV
        case_sensitive = False
        # The .env is shared with the orchestrator (POSTGRES_USER, SYNC_INTERVAL_MINUTES,
        # etc. are that process's settings, not the backend's) -- ignore rather than
        # declare fields this service never reads.
        extra = "ignore"


settings = Settings()
