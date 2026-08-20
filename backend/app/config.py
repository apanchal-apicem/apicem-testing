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

    # Fully self-hosted analytics assistant (doc Sec 9 update, 2026-08-20) -- Ollama's
    # local REST server, not a third-party API. Model is swappable without a code change;
    # start with qwen2.5:7b and drop to a smaller one if CPU-only latency is too slow.
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"

    # Blank host = log the email to the backend's own console instead of sending (dev
    # fallback -- see .env.example). Fill in once a real provider is configured.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "onboarding@apicem.local"

    class Config:
        env_file = _REPO_ROOT_ENV
        case_sensitive = False
        # The .env is shared with the orchestrator (POSTGRES_USER, SYNC_INTERVAL_MINUTES,
        # etc. are that process's settings, not the backend's) -- ignore rather than
        # declare fields this service never reads.
        extra = "ignore"


settings = Settings()
