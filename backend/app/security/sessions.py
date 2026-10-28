"""Sesiones de cuenta (sesión única) sobre las tablas user_sessions / account_session_state.

Equivalente en Python de backend/code-formatter/src/sessions.js: mismo esquema, mismo token (base64url de 32 bytes)
y mismo hash (SHA-256), de modo que ambos backends validan las mismas sesiones.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db


@dataclass(frozen=True)
class SessionInfo:
    session_id: uuid.UUID
    account_id: uuid.UUID
    generation: int
    expires_at: datetime


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def set_session_cookie(response: Response, token: str, max_age: int) -> None:
    """__Host-: Secure, Path=/, sin Domain (ámbito exclusivo del host de la API). HttpOnly, SameSite=Lax."""
    response.set_cookie(
        key=get_settings().session_cookie_name,
        value=token,
        max_age=max_age,
        path="/",
        secure=True,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.set_cookie(
        key=get_settings().session_cookie_name, value="", max_age=0, expires=0, path="/", secure=True, httponly=True, samesite="lax"
    )


def create_session(db: Session, account_id: uuid.UUID, user_agent: str | None, ttl_seconds: int) -> tuple[str, SessionInfo]:
    """Login atómico: FOR UPDATE sobre el estado de la cuenta serializa logins; el nuevo revoca al anterior."""
    token = new_token()
    db.execute(
        text("INSERT INTO account_session_state (account_id) VALUES (:a) ON CONFLICT (account_id) DO NOTHING"),
        {"a": account_id},
    )
    state = db.execute(
        text("SELECT active_session_id, session_generation FROM account_session_state WHERE account_id = :a FOR UPDATE"),
        {"a": account_id},
    ).one()
    if state.active_session_id:
        db.execute(
            text(
                "UPDATE user_sessions SET status = 'revoked', revoked_at = now(), revoked_reason = 'replaced' "
                "WHERE session_id = :s AND status = 'active'"
            ),
            {"s": state.active_session_id},
        )
    generation = int(state.session_generation) + 1
    created = db.execute(
        text(
            """
            INSERT INTO user_sessions (account_id, token_hash, status, session_generation, expires_at, user_agent)
            VALUES (:a, :h, 'active', :g, now() + make_interval(secs => :ttl), :ua)
            RETURNING session_id, expires_at
            """
        ),
        {"a": account_id, "h": hash_token(token), "g": generation, "ttl": ttl_seconds, "ua": (user_agent or "")[:500] or None},
    ).one()
    db.execute(
        text(
            "UPDATE account_session_state SET active_session_id = :s, session_generation = :g, updated_at = now() "
            "WHERE account_id = :a"
        ),
        {"s": created.session_id, "g": generation, "a": account_id},
    )
    return token, SessionInfo(created.session_id, account_id, generation, created.expires_at)


_ACTIVE_SESSION_SQL = """
    SELECT s.session_id, s.account_id, s.session_generation, s.expires_at
      FROM user_sessions s
      JOIN account_session_state a
        ON a.account_id = s.account_id
       AND a.active_session_id = s.session_id
       AND a.session_generation = s.session_generation
     WHERE s.status = 'active' AND s.expires_at > now() AND s.token_hash = :h
"""


def validate_token(db: Session, token: str | None) -> SessionInfo | None:
    if not token:
        return None
    row = db.execute(text(_ACTIVE_SESSION_SQL), {"h": hash_token(token)}).first()
    return SessionInfo(row.session_id, row.account_id, int(row.session_generation), row.expires_at) if row else None


def end_session(db: Session, session: SessionInfo) -> None:
    db.execute(text("SELECT 1 FROM account_session_state WHERE account_id = :a FOR UPDATE"), {"a": session.account_id})
    db.execute(
        text(
            "UPDATE user_sessions SET status = 'logged_out', revoked_at = now(), revoked_reason = 'logout' "
            "WHERE session_id = :s AND status = 'active'"
        ),
        {"s": session.session_id},
    )
    db.execute(
        text(
            "UPDATE account_session_state SET active_session_id = NULL, updated_at = now() "
            "WHERE account_id = :a AND active_session_id = :s"
        ),
        {"a": session.account_id, "s": session.session_id},
    )


def current_session(request: Request, db: Annotated[Session, Depends(get_db)]) -> SessionInfo:
    """Valida la cookie contra la BD en cada petición (revocación inmediata)."""
    session = validate_token(db, request.cookies.get(get_settings().session_cookie_name))
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session
