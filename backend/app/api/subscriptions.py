from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.account import Account
from app.security.csrf import require_csrf
from app.security.rate_limit import client_ip, payment_limiter
from app.security.sessions import SessionInfo
from app.services.subscription_service import TrialAlreadyUsedError, activate_trial_7d

router = APIRouter(prefix="/api")


class TrialActivateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_fingerprint: str = Field(default="unknown", max_length=256)


@router.post("/subscriptions/trial", status_code=201)
def activate_trial(
    body: TrialActivateBody,
    request: Request,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    payment_limiter.check(f"trial:{session.account_id}:{client_ip(request)}")
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")

    settings = get_settings()
    try:
        sub = activate_trial_7d(
            db,
            settings,
            account=account,
            client_ip_addr=client_ip(request),
            device_fingerprint=body.device_fingerprint,
        )
    except TrialAlreadyUsedError:
        raise HTTPException(status_code=409, detail="TRIAL_ALREADY_USED") from None

    return {
        "ok": True,
        "plan": "pro",
        "plan_id": sub.plan_id,
        "expires_at": sub.expires_at.isoformat(),
    }
