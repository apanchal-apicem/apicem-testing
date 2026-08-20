"""Minimal email sending with a local-dev fallback: with no SMTP host configured, an email
just logs to the backend's own console instead of failing or silently doing nothing --
lets the whole password-reset flow be built and tested before any real provider exists.
"""
import logging
import smtplib
from email.mime.text import MIMEText

from .config import settings

logger = logging.getLogger("apicem.email")


def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.info("DEV EMAIL (no SMTP configured) -> to=%s subject=%r\n%s", to_email, subject, body)
        return

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to_email

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, [to_email], message.as_string())
