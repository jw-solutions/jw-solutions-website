from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.account import Account
from app.security.csrf import csrf_token_for, require_csrf
from app.security.sessions import (
    SessionInfo,
    clear_session_cookie,
    create_session,
    end_session,
    set_session_cookie,
)
from app.services.subscription_service import has_active_pro
from security.passwords import hash_password, verify_password  # backend/security/passwords.py (Argon2id compartido)

router = APIRouter(prefix="/api")


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


@lru_cache
def _dummy_hash() -> str:
    return hash_password("dummy-password-for-timing-equalization")


@router.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response, db: Annotated[Session, Depends(get_db)]) -> dict:
    settings = get_settings()
    account = db.execute(select(Account).where(func.lower(Account.email) == body.email.lower())).scalar_one_or_none()
    # Se verifica siempre contra un hash para no revelar por tiempo si la cuenta existe.
    valid = verify_password(account.password_hash if account else _dummy_hash(), body.password)
    if account is None or not valid or account.status != "active":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token, session = create_session(db, account.account_id, request.headers.get("user-agent"), settings.session_ttl)
    set_session_cookie(response, token, settings.session_ttl)
    response.headers["Cache-Control"] = "no-store"
    return {
        "csrf_token": csrf_token_for(session, settings.session_secret.get_secret_value()),
        "expires_at": session.expires_at.isoformat(),
        "plan": account.plan,
    }


@router.get("/csrf")
def csrf(session: Annotated[SessionInfo, Depends(require_csrf)], response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {"csrf_token": csrf_token_for(session, get_settings().session_secret.get_secret_value())}


@router.get("/me")
def me(session: Annotated[SessionInfo, Depends(require_csrf)], db: Annotated[Session, Depends(get_db)]) -> dict:
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"email": account.email, "plan": account.plan, "pro_active": has_active_pro(db, account.account_id)}


@router.post("/auth/logout", status_code=204)
def logout(
    response: Response,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    end_session(db, session)
    clear_session_cookie(response)
