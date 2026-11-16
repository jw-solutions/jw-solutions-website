from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import urllib.request
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.academy import (
    AcademyCertificate,
    AcademyHintCache,
    AcademyProLevel,
    UserAchievement,
    UserLearningProgress,
)
from app.models.account import Account
from app.models.subscription import Subscription
from app.security.csrf import require_csrf
from app.security.rate_limit import academy_hint_limiter
from app.security.sessions import SessionInfo, current_session
from app.services.certificate_service import (
    CertificateError,
    check_requirements_met,
    get_portfolio_public,
    get_quota_status,
    issue_certificate_tx,
    sanitize_holder_name,
    update_holder_name_tx,
    verify_certificate_public,
)

router = APIRouter(prefix="/api/academy", tags=["academy"])


def _require_active_account(db: Session, session: SessionInfo) -> Account:
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")
    return account


def _has_active_pro(db: Session, account: Account) -> bool:
    if account.plan == "pro":
        return True
    now = datetime.now(timezone.utc)
    sub = db.execute(
        select(Subscription)
        .where(
            Subscription.account_id == account.account_id,
            Subscription.status == "ACTIVE",
            Subscription.expires_at > now,
        )
        .limit(1)
    ).scalar_one_or_none()
    return sub is not None


class AcademySyncBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completed: list[str] = Field(default_factory=list, max_length=200)
    remedial_completed: list[str] = Field(default_factory=list, max_length=200)
    achievements: list[str] = Field(default_factory=list, max_length=100)
    daily_streak: int = Field(default=0, ge=0, le=3650)
    last_daily_date: date | None = None


class AcademyHintBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    challenge_id: str = Field(min_length=2, max_length=80)
    error_code: str = Field(min_length=2, max_length=64)
    ast_signature: str = Field(min_length=1, max_length=128)
    code_snippet: str = Field(default="", max_length=4000)
    locale: str = Field(default="es", max_length=16)


@router.get("/progress")
def get_progress(
    session: Annotated[SessionInfo, Depends(current_session)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    row = db.get(UserLearningProgress, account.account_id)
    ach_rows = db.execute(
        select(UserAchievement.achievement_id).where(UserAchievement.account_id == account.account_id)
    ).scalars().all()
    if row is None:
        return {
            "completed": [],
            "remedial_completed": [],
            "achievements": list(ach_rows),
            "daily_streak": 0,
            "last_daily_date": None,
            "is_pro": _has_active_pro(db, account),
        }
    return {
        "completed": list(row.completed or []),
        "remedial_completed": list(row.remedial_completed or []),
        "achievements": list(ach_rows),
        "daily_streak": row.daily_streak,
        "last_daily_date": row.last_daily_date.isoformat() if row.last_daily_date else None,
        "is_pro": _has_active_pro(db, account),
    }


@router.post("/sync")
def sync_progress(
    body: AcademySyncBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    row = db.get(UserLearningProgress, account.account_id)

    if row is None:
        row = UserLearningProgress(
            account_id=account.account_id,
            completed=list(dict.fromkeys(body.completed)),
            remedial_completed=list(dict.fromkeys(body.remedial_completed)),
            daily_streak=body.daily_streak,
            last_daily_date=body.last_daily_date,
        )
        db.add(row)
    else:
        row.completed = list(dict.fromkeys([*(row.completed or []), *body.completed]))
        row.remedial_completed = list(dict.fromkeys([*(row.remedial_completed or []), *body.remedial_completed]))
        row.daily_streak = max(int(row.daily_streak or 0), body.daily_streak)
        if body.last_daily_date and (row.last_daily_date is None or body.last_daily_date > row.last_daily_date):
            row.last_daily_date = body.last_daily_date
        row.updated_at = datetime.now(timezone.utc)

    existing_ach = set(
        db.execute(
            select(UserAchievement.achievement_id).where(UserAchievement.account_id == account.account_id)
        ).scalars().all()
    )
    for ach_id in dict.fromkeys(body.achievements):
        if ach_id not in existing_ach:
            db.add(UserAchievement(account_id=account.account_id, achievement_id=ach_id[:64]))
            existing_ach.add(ach_id)

    db.flush()
    return {
        "completed": list(row.completed or []),
        "remedial_completed": list(row.remedial_completed or []),
        "achievements": sorted(existing_ach),
        "daily_streak": row.daily_streak,
        "last_daily_date": row.last_daily_date.isoformat() if row.last_daily_date else None,
    }


@router.get("/levels/{tech}/{level}")
def get_pro_level(
    tech: str,
    level: int,
    session: Annotated[SessionInfo, Depends(current_session)],
    db: Annotated[Session, Depends(get_db)],
    locale: str = "es",
) -> dict:
    account = _require_active_account(db, session)
    if not _has_active_pro(db, account):
        raise HTTPException(status_code=403, detail="Pro subscription required")

    row = db.execute(
        select(AcademyProLevel).where(
            AcademyProLevel.tech == tech.lower(),
            AcademyProLevel.level == level,
            AcademyProLevel.locale == locale,
        )
    ).scalar_one_or_none()
    if row is None and locale != "es":
        row = db.execute(
            select(AcademyProLevel).where(
                AcademyProLevel.tech == tech.lower(),
                AcademyProLevel.level == level,
                AcademyProLevel.locale == "es",
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Level not found")

    return {"tech": row.tech, "level": row.level, "locale": row.locale, "title": row.title, **row.payload}


def _generate_socratic_hint(body: AcademyHintBody) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key:
        prompt = (
            f"Act as a Socratic Clean Code tutor in language '{body.locale}'. "
            f"Challenge: {body.challenge_id}. Error: {body.error_code}. "
            "Give one concise guiding question (max 2 sentences) without giving the full solution.\n"
            f"Snippet:\n{body.code_snippet[:1000]}"
        )
        req_data = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text:
                    return text[:600]
        except Exception:
            pass

    if body.locale.startswith("en"):
        return f"Check the '{body.error_code}' condition in your code: are edge cases and official style docs handled before returning?"
    return f"Revisa la condición '{body.error_code}' en tu código: ¿estás validando los casos borde y la documentación oficial antes de retornar?"


@router.post("/hint")
def get_socratic_hint(
    body: AcademyHintBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    if not _has_active_pro(db, account):
        raise HTTPException(status_code=403, detail="Pro subscription required")

    academy_hint_limiter.check(str(session.account_id))
    raw_key = f"{body.challenge_id}:{body.error_code}:{body.ast_signature}:{body.locale}".encode("utf-8")
    cache_key = hashlib.sha256(raw_key).hexdigest()

    cached = db.get(AcademyHintCache, cache_key)
    if cached is not None:
        return {"hint": cached.hint_text, "cached": True, "cache_key": cache_key}

    hint_text = _generate_socratic_hint(body)
    db.add(
        AcademyHintCache(
            cache_key=cache_key,
            challenge_id=body.challenge_id,
            error_code=body.error_code,
            ast_signature=body.ast_signature,
            locale=body.locale,
            hint_text=hint_text,
        )
    )
    db.flush()
    return {"hint": hint_text, "cached": False, "cache_key": cache_key}


class CertificateIssueBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cert_type: str = Field(default="language", max_length=32)
    target_slug: str | None = Field(default=None, min_length=2, max_length=80)
    path_id: str | None = Field(default=None, min_length=2, max_length=64)
    holder_full_name: str | None = Field(default=None, max_length=140)
    holder_name: str | None = Field(default=None, max_length=120)
    language_code: str = Field(default="es", max_length=16)
    ui_locale: str = Field(default="es", max_length=16)


class CertificatePreviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cert_type: str = Field(default="language", max_length=32)
    target_slug: str = Field(min_length=2, max_length=80)
    holder_full_name: str = Field(default="Preview Developer", max_length=140)
    language_code: str = Field(default="es", max_length=16)


class HolderNamePatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    holder_full_name: str = Field(min_length=3, max_length=140)


@router.get("/certificates/quota")
def certificate_quota(
    session: Annotated[SessionInfo, Depends(current_session)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    return get_quota_status(db, account)


@router.post("/certificates/preview")
def preview_certificate(
    body: CertificatePreviewBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    met = check_requirements_met(db, account.account_id, cert_type=body.cert_type.lower(), target_slug=body.target_slug.lower())
    return {
        "is_preview": True,
        "requirements_met": met,
        "cert_type": body.cert_type.lower(),
        "target_slug": body.target_slug.lower(),
        "holder_full_name": sanitize_holder_name(body.holder_full_name) or account.certificate_holder_name or "Preview Developer",
        "language_code": body.language_code,
        "cert_code": "PREVIEW-WATERMARK",
        "status": "preview",
    }


@router.post("/certificates/issue", status_code=201)
def issue_certificate(
    body: CertificateIssueBody,
    response: Response,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    slug = (body.target_slug or body.path_id or "").strip()
    if not slug:
        raise HTTPException(status_code=422, detail={"code": "TARGET_REQUIRED", "detail": "target_slug is required"})
    name = body.holder_full_name or body.holder_name
    try:
        data, status_code = issue_certificate_tx(
            db,
            get_settings(),
            account,
            cert_type=body.cert_type,
            target_slug=slug,
            language_code=body.language_code,
            holder_full_name=name,
            ui_locale=body.ui_locale,
        )
    except CertificateError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "detail": exc.detail, **exc.extra}) from None
    if response is not None:
        response.status_code = status_code
    return data


@router.patch("/certificates/holder-name")
def patch_holder_name(
    body: HolderNamePatchBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    account = _require_active_account(db, session)
    try:
        updated = update_holder_name_tx(db, account, body.holder_full_name)
    except CertificateError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "detail": exc.detail}) from None
    return {"ok": True, "holder_full_name": updated}


@router.get("/certificates/verify/{cert_code}")
def verify_certificate_v2(
    cert_code: str,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    data = verify_certificate_public(db, get_settings(), cert_code, increment_views=True)
    if data is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if data.get("status") == "revoked":
        response.headers["Cache-Control"] = "public, max-age=300, s-maxage=300"
    else:
        response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=86400"
    return data


@router.get("/certificates/portfolio/{portfolio_slug}")
def get_public_portfolio(
    portfolio_slug: str,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    data = get_portfolio_public(db, portfolio_slug)
    if data is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=43200"
    return data


@router.get("/certificates/{cert_id}")
def verify_certificate(cert_id: str, response: Response, db: Annotated[Session, Depends(get_db)]) -> dict:
    data = verify_certificate_public(db, get_settings(), cert_id, increment_views=False)
    if data is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if response is not None:
        response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=86400"
    return data
