"""In-memory rate limiting for auth endpoints -- nothing currently stops brute-forcing
login or hammering signup. Fine for a single-process deployment; horizontally scaling
this backend needs a shared store (Redis) instead, since each process would otherwise
count independently.
"""
import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

_hits: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def reset():
    """Test-only: TestClient requests all share one synthetic client IP, so without this,
    unrelated tests running back-to-back trip each other's rate limit -- shared global
    state a real multi-client deployment never has to worry about."""
    with _lock:
        _hits.clear()


def _check(key: str, max_attempts: int, window_seconds: int) -> bool:
    now = time.time()
    cutoff = now - window_seconds
    with _lock:
        attempts = _hits[key]
        while attempts and attempts[0] < cutoff:
            attempts.pop(0)
        if len(attempts) >= max_attempts:
            return False
        attempts.append(now)
        return True


def rate_limit(max_attempts: int = 5, window_seconds: int = 60):
    """FastAPI dependency: Depends(rate_limit(5, 60)) allows 5 requests per 60s per
    (client IP, route) pair."""

    def dependency(request: Request):
        client_host = request.client.host if request.client else "unknown"
        key = f"{client_host}:{request.url.path}"
        if not _check(key, max_attempts, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait a moment and try again.",
            )

    return dependency
