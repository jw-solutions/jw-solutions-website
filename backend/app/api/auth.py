from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.account import Account
from app.security.csrf import csrf_token_for, require_csrf
from app.security.rate_limit import auth_limiter, client_ip
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

MIN_PASSWORD = 10
MAX_PASSWORD = 128


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class RegisterBody(BaseModel):
    """Misma política que el frontend (auth-modal.js) y el servidor Node: contraseña de 10 a 128 caracteres."""

    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD, max_length=MAX_PASSWORD)

    @model_validator(mode="after")
    def _password_not_email(self) -> "RegisterBody":
        if self.password.lower() == str(self.email).lower():
            raise ValueError("password no puede ser el correo")
        return self


@lru_cache
def _dummy_hash() -> str:
    return hash_password("dummy-password-for-timing-equalization")


def _start_session(account: Account, request: Request, response: Response, db: Session, status_code: int = 200) -> dict:
    settings = get_settings()
    token, session = create_session(db, account.account_id, request.headers.get("user-agent"), settings.session_ttl)
    set_session_cookie(response, token, settings.session_ttl)
    response.status_code = status_code
    response.headers["Cache-Control"] = "no-store"
    return {
        "ok": True,
        "csrf_token": csrf_token_for(session, settings.session_secret.get_secret_value()),
        "expires_at": session.expires_at.isoformat(),
        "plan": account.plan,
    }


@router.post("/auth/register", status_code=201)
def register(body: RegisterBody, request: Request, response: Response, db: Annotated[Session, Depends(get_db)]) -> dict:
    auth_limiter.check(f"register:{client_ip(request)}")
    email = str(body.email).strip().lower()
    password_hash = hash_password(body.password)  # Argon2id (backend/security/passwords.py)
    try:
        # SAVEPOINT: el índice único ux_accounts_email (lower(email)) rechaza duplicados sin romper la transacción.
        with db.begin_nested():
            account = Account(email=email, password_hash=password_hash)
            db.add(account)
            db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Account already exists") from None
    return _start_session(account, request, response, db, status_code=201)


@router.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response, db: Annotated[Session, Depends(get_db)]) -> dict:
    auth_limiter.check(f"login:{client_ip(request)}")
    settings = get_settings()
    account = db.execute(select(Account).where(func.lower(Account.email) == body.email.lower())).scalar_one_or_none()
    # Se verifica siempre contra un hash para no revelar por tiempo si la cuenta existe.
    valid = verify_password(account.password_hash if account else _dummy_hash(), body.password)
    if account is None or not valid or account.status != "active":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return _start_session(account, request, response, db)


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
