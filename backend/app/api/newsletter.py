from __future__ import annotations

import hmac
import secrets
from datetime import datetime, timezone
from typing import Annotated, Any

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.newsletter import NewsletterDelivery, NewsletterSubscriber
from app.security.anti_scraping import defense_engine
from app.security.rate_limit import client_ip, newsletter_limiter
from app.services.newsletter_service import (
    ALLOWED_CHANNELS,
    normalize_lang,
    render_newsletter_email,
    render_unsubscribe_page,
    send_html_email,
)

router = APIRouter(prefix="/api/newsletter")


class SubscribeBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str = Field(min_length=3, max_length=254)
    lang: str = Field(default="es", max_length=10)
    channel: str = Field(default="main-website", max_length=50)
    source: str = Field(default="website", max_length=50)
    website: str = Field(default="", max_length=200)
    gotcha: str = Field(default="", alias="_gotcha", max_length=200)


class ArticlePayload(BaseModel):
    slug: str = Field(min_length=1, max_length=255)
    title_es: str | None = None
    title_en: str | None = None
    summary_es: str | None = None
    summary_en: str | None = None
    url_es: str | None = None
    url_en: str | None = None
    title: str | None = None
    summary: str | None = None
    url: str | None = None
    published_at: str | None = None


class BroadcastBody(BaseModel):
    event: str = Field(default="article.published", max_length=64)
    event_id: str = Field(min_length=1, max_length=128)
    channel: str = Field(default="main-website", max_length=50)
    article: ArticlePayload | None = None
    slug: str | None = Field(default=None, max_length=255)
    programming_language: str | None = Field(default=None, max_length=50)
    interactive_snippet: str | None = None
    locales: dict[str, Any] | None = None
    published_at: str | None = None


def _validate_channel(raw: str | None) -> str:
    ch = (raw or "main-website").strip()
    if ch not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=422, detail=f"Canal no permitido: {ch}")
    return ch


@router.post("/subscribe")
def subscribe(
    body: SubscribeBody,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    ip = client_ip(request)
    newsletter_limiter.check(ip)

    # Honeypot silencioso: no guarda datos ni envía correos, pero registra telemetría anti-bot sin PII.
    if (body.website or "").strip() or (body.gotcha or "").strip():
        assessment = defense_engine.assess_request(
            client_key=ip,
            route=request.url.path,
            user_agent=request.headers.get("user-agent"),
            accept_header=request.headers.get("accept"),
            honeypot_triggered=True,
        )
        defense_engine.emit_telemetry(assessment, route=request.url.path)
        return {"ok": True, "status": "subscribed"}

    try:
        normalized_email = validate_email(body.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=422, detail="Correo electrónico inválido")

    channel = _validate_channel(body.channel)
    lang = normalize_lang(body.lang, default="en")
    source = (body.source or "website").strip()[:50] or "website"

    existing = db.execute(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == normalized_email,
            NewsletterSubscriber.channel == channel,
        )
    ).scalar_one_or_none()

    if existing is None:
        sub = NewsletterSubscriber(
            email=normalized_email,
            channel=channel,
            lang=lang,
            status="active",
            unsubscribe_token=secrets.token_urlsafe(32),
            source=source,
        )
        db.add(sub)
        db.flush()
        return {"ok": True, "status": "subscribed"}

    if existing.status == "unsubscribed":
        existing.status = "active"
        existing.unsubscribed_at = None
        existing.lang = lang
        existing.source = source
        existing.subscribed_at = datetime.now(timezone.utc)
        db.flush()
        return {"ok": True, "status": "subscribed"}

    return {"ok": True, "status": "already_subscribed"}


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(
    token: Annotated[str, Query(min_length=10, max_length=128)],
    db: Annotated[Session, Depends(get_db)],
) -> HTMLResponse:
    sub = db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.unsubscribe_token == token)
    ).scalar_one_or_none()

    if sub is not None and sub.status != "unsubscribed":
        sub.status = "unsubscribed"
        sub.unsubscribed_at = datetime.now(timezone.utc)
        db.flush()

    lang = getattr(sub, "lang", "es") if sub is not None else "es"
    channel = getattr(sub, "channel", "main-website") if sub is not None else "main-website"
    page = render_unsubscribe_page(found=(sub is not None), lang=lang, channel=channel)
    return HTMLResponse(content=page, status_code=200 if sub is not None else 404)


def _require_bearer_token(authorization: str | None, expected: str) -> None:
    if not expected:
        raise HTTPException(status_code=503, detail="Newsletter broadcast not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    provided = authorization[7:].strip()
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/broadcast")
def broadcast(
    body: BroadcastBody,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    settings = get_settings()
    _require_bearer_token(authorization, settings.newsletter_webhook_token.get_secret_value())
    channel = _validate_channel(body.channel)

    if body.article is not None:
        article_slug = body.article.slug
        payload_dict = body.article.model_dump()
    elif body.slug:
        article_slug = body.slug
        payload_dict = {
            "slug": body.slug,
            "programming_language": body.programming_language,
            "interactive_snippet": body.interactive_snippet,
            "locales": body.locales or {},
            "published_at": body.published_at,
        }
    else:
        raise HTTPException(status_code=422, detail="Debe incluir article o slug en el payload")

    subscribers = db.execute(
        select(NewsletterSubscriber)
        .where(
            NewsletterSubscriber.status == "active",
            NewsletterSubscriber.channel == channel,
        )
        .order_by(NewsletterSubscriber.id)
    ).scalars().all()

    already_sent_ids = set(
        db.execute(
            select(NewsletterDelivery.subscriber_id).where(
                NewsletterDelivery.event_id == body.event_id,
                NewsletterDelivery.status == "sent",
            )
        ).scalars().all()
    )

    base_url = settings.newsletter_base_url.rstrip("/")

    sent = 0
    skipped = 0
    failed = 0

    for sub in subscribers:
        if sub.id in already_sent_ids:
            skipped += 1
            continue

        unsub_url = f"{base_url}/api/newsletter/unsubscribe?token={sub.unsubscribe_token}"
        subject, text_body, html_body = render_newsletter_email(
            payload_dict, sub.lang, unsub_url, channel=channel
        )

        delivery_status = "sent"
        err_msg: str | None = None
        try:
            send_html_email(settings, sub.email, subject, text_body, html_body)
            sent += 1
        except Exception as exc:
            delivery_status = "failed"
            err_msg = str(exc)[:500]
            failed += 1

        stmt = (
            pg_insert(NewsletterDelivery)
            .values(
                event_id=body.event_id,
                channel=channel,
                article_slug=article_slug,
                subscriber_id=sub.id,
                status=delivery_status,
                error_message=err_msg,
            )
            .on_conflict_do_update(
                constraint="uq_newsletter_deliveries_event_sub",
                set_={
                    "status": delivery_status,
                    "error_message": err_msg,
                    "sent_at": datetime.now(timezone.utc),
                },
            )
        )
        db.execute(stmt)

    if sent == 0 and failed > 0:
        db.commit()
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "sent": sent, "skipped": skipped, "failed": failed},
        )

    return {"ok": True, "sent": sent, "skipped": skipped, "failed": failed}


@router.get("/subscribers")
def list_subscribers(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    channel: Annotated[str | None, Query(max_length=50)] = None,
) -> dict[str, Any]:
    settings = get_settings()
    _require_bearer_token(authorization, settings.newsletter_webhook_token.get_secret_value())

    stmt = select(NewsletterSubscriber).order_by(NewsletterSubscriber.id)
    if channel is not None:
        validated_channel = _validate_channel(channel)
        stmt = stmt.where(NewsletterSubscriber.channel == validated_channel)

    rows = db.execute(stmt).scalars().all()

    total_active = sum(1 for r in rows if r.status == "active")
    total_unsubscribed = sum(1 for r in rows if r.status == "unsubscribed")

    return {
        "ok": True,
        "total_active": total_active,
        "total_unsubscribed": total_unsubscribed,
        "subscribers": [
            {
                "id": r.id,
                "email": r.email,
                "channel": getattr(r, "channel", "main-website"),
                "lang": r.lang,
                "status": r.status,
                "source": r.source,
                "subscribed_at": r.subscribed_at.isoformat() if r.subscribed_at else None,
                "unsubscribed_at": r.unsubscribed_at.isoformat() if r.unsubscribed_at else None,
            }
            for r in rows
        ],
    }
