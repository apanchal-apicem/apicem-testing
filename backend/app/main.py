import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .routers import assistant, auth, connections, dashboards, metrics, sync, team, tenant

# Without this, Python's root logger defaults to WARNING with no handler attached, so every
# INFO-level log.info() call anywhere in the app (e.g. the dev-mode "email" fallback) is
# silently dropped rather than actually showing up in the console.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("apicem")

app = FastAPI(title="Apicem Engine Analytics API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    # A regex (not a fixed allow_origins list) so teammates on the same LAN can reach this
    # over the host machine's network IP (e.g. http://192.168.1.53:5173), not just
    # http://localhost:5173 -- matches localhost/127.0.0.1 plus the three private-IP ranges
    # (RFC 1918), all on the frontend's fixed dev port. Deliberately doesn't match public
    # IPs -- this stays a LAN-only allowance, consistent with this product being local-only
    # by choice (no public hosting yet).
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2}):5173$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Starlette's default 500 path for an unhandled exception bypasses CORSMiddleware
    # entirely, so the browser sees a response with no Access-Control-Allow-Origin header
    # and reports a generic "Failed to fetch" instead of the real error. Handling it here
    # routes the response back through CORSMiddleware normally, and logs the real cause
    # server-side either way.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.include_router(auth.router)
app.include_router(connections.router)
app.include_router(sync.router)
app.include_router(metrics.router)
app.include_router(dashboards.router)
app.include_router(team.router)
app.include_router(assistant.router)
app.include_router(tenant.router)

# Serves uploaded workspace logos (tenant.py writes here) -- local-disk storage, consistent
# with this product's local-only scope. create=True so a fresh checkout with no logos
# uploaded yet doesn't 500 on startup for a missing directory.
_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
os.makedirs(os.path.join(_UPLOADS_DIR, "logos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
