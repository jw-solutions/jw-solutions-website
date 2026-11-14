from __future__ import annotations

import hmac
import secrets
from datetime import datetime, timezone
from typing import Annotated, Any

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.newsletter import NewsletterDelivery, NewsletterSubscriber
from app.security.rate_limit import client_ip, newsletter_limiter
from app.services.newsletter_service import render_newsletter_email, send_html_email

router = APIRouter(prefix="/api/newsletter")


class SubscribeBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    lang: str = Field(default="es", max_length=10)
    source: str = Field(default="website", max_length=50)


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
    article: ArticlePayload


@router.post("/subscribe")
def subscribe(
    body: SubscribeBody,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    newsletter_limiter.check(client_ip(request))

    try:
        normalized_email = validate_email(body.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=422, detail="Correo electrónico inválido")

    lang = "en" if body.lang.strip().lower().startswith("en") else "es"
    source = (body.source or "website").strip()[:50] or "website"

    existing = db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == normalized_email)
    ).scalar_one_or_none()

    if existing is None:
        sub = NewsletterSubscriber(
            email=normalized_email,
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

    title = "Baja confirmada | JW Solutions" if sub is not None else "Enlace no válido | JW Solutions"
    heading = "Te has dado de baja correctamente" if sub is not None else "Enlace de baja no válido o expirado"
    msg = (
        "Ya no recibirás correos semanales del boletín de JW Solutions. Puedes volver a suscribirte cuando quieras desde nuestra web."
        if sub is not None
        else "No pudimos encontrar una suscripción activa asociada a este enlace."
    )

    page = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:40px 16px;background:#0B0E12;color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:80vh;">
  <div style="max-width:480px;width:100%;background:#111827;border:1px solid #D4AF37;border-radius:14px;padding:32px;text-align:center;">
    <div style="display:inline-block;background:#D4AF37;color:#0B0E12;font-weight:800;padding:6px 12px;border-radius:6px;letter-spacing:1px;margin-bottom:16px;">JW SOLUTIONS</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#FFFFFF;">{heading}</h1>
    <p style="margin:0 0 24px;color:#D1D5DB;line-height:1.6;font-size:15px;">{msg}</p>
    <a href="https://jw-solutions.com/" style="display:inline-block;padding:12px 24px;background:#D4AF37;color:#0B0E12;font-weight:700;text-decoration:none;border-radius:8px;">Volver a jw-solutions.com</a>
  </div>
</body>
</html>"""
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

    subscribers = db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.status == "active").order_by(NewsletterSubscriber.id)
    ).scalars().all()

    already_sent_ids = set(
        db.execute(
            select(NewsletterDelivery.subscriber_id).where(
                NewsletterDelivery.event_id == body.event_id,
                NewsletterDelivery.status == "sent",
            )
        ).scalars().all()
    )

    article_dict = body.article.model_dump()
    base_url = settings.newsletter_base_url.rstrip("/")

    sent = 0
    skipped = 0
    failed = 0

    for sub in subscribers:
        if sub.id in already_sent_ids:
            skipped += 1
            continue

        unsub_url = f"{base_url}/api/newsletter/unsubscribe?token={sub.unsubscribe_token}"
        subject, text_body, html_body = render_newsletter_email(article_dict, sub.lang, unsub_url)

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
                article_slug=body.article.slug,
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
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "sent": sent, "skipped": skipped, "failed": failed},
        )

    return {"ok": True, "sent": sent, "skipped": skipped, "failed": failed}
