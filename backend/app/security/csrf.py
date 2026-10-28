from __future__ import annotations

import hashlib
import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.core.config import get_settings
from app.security.origin_validation import UNSAFE_METHODS
from app.security.sessions import SessionInfo, current_session

CSRF_HEADER = "X-CSRF-Token"


def csrf_token_for(session: SessionInfo, secret: str) -> str:
    """Token determinista HMAC ligado a la sesión y su generación: caduca al revocarse o reemplazarse la sesión.

    No es el token de sesión; el cliente lo guarda en memoria (nunca en localStorage) y lo envía en X-CSRF-Token.
    """
    message = f"csrf:{session.session_id}:{session.generation}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_csrf(session: SessionInfo, supplied: str | None, secret: str) -> bool:
    return bool(supplied) and hmac.compare_digest(csrf_token_for(session, secret), supplied)


def require_csrf(request: Request, session: Annotated[SessionInfo, Depends(current_session)]) -> SessionInfo:
    """Dependencia para rutas con cookie de sesión: sesión válida + (en escrituras) token CSRF correcto."""
    if request.method in UNSAFE_METHODS:
        secret = get_settings().session_secret.get_secret_value()
        if not verify_csrf(session, request.headers.get(CSRF_HEADER), secret):
            raise HTTPException(status_code=403, detail="CSRF token missing or invalid")
    return session
