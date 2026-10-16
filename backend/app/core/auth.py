import secrets
import time
from collections import defaultdict, deque

from fastapi import Header, Request

from app.config import settings
from app.core.errors import unauthorized

_attempts: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(client_id: str) -> None:
    now = time.time()
    window = settings.auth_rate_limit_window_seconds
    limit = settings.auth_rate_limit_attempts
    attempts = _attempts[client_id]
    while attempts and attempts[0] < now - window:
        attempts.popleft()
    if len(attempts) >= limit:
        raise unauthorized("Too many authentication attempts")


def _client_id(request: Request) -> str:
    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    addresses = [part.strip() for part in forwarded.split(",") if part.strip()]
    # Count from the right: entries further left are client-controlled.
    if hops > 0 and len(addresses) >= hops:
        return addresses[-hops]
    return request.client.host if request.client else "unknown"


def require_upload_password(
    request: Request, authorization: str | None = Header(default=None)
) -> None:
    client_id = _client_id(request)
    _check_rate_limit(client_id)

    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]

    if not secrets.compare_digest(token, settings.upload_password):
        _attempts[client_id].append(time.time())
        raise unauthorized("Invalid upload password")
