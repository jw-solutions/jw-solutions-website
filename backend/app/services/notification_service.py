from __future__ import annotations

import json
import re
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from typing import Any

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.outbox import STATUS_QUEUED

_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")


class PermanentDeliveryError(Exception):
    """Fallo que no se arregla reintentando (plantilla desconocida, destinatario inválido)."""


def clean(value: Any, limit: int = 200) -> str:
    """Valores del usuario solo en el cuerpo y sin saltos/control: evita inyección de cabeceras."""
    return _CONTROL.sub(" ", str(value if value is not None else "")).strip()[:limit]


def enqueue(
    session: Session,
    event_type: str,
    payload: dict[str, Any],
    idempotency_key: str | None = None,
) -> int | None:
    """Inserta un evento en el outbox dentro de la transacción del llamador.

    Devuelve el id, o None si la clave de idempotencia ya existía (no se duplica el evento de negocio).
    """
    row = session.execute(
        text(
            """
            INSERT INTO notification_outbox (event_type, payload, status, idempotency_key)
            VALUES (:event_type, CAST(:payload AS JSONB), :status, :key)
            ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
            RETURNING id
            """
        ),
        {"event_type": event_type, "payload": _json(payload), "status": STATUS_QUEUED, "key": idempotency_key},
    ).first()
    return row[0] if row else None


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, default=str, ensure_ascii=False)


# --- Plantillas -------------------------------------------------------------------------------------------------

def _fmt_date(value: Any) -> str:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return clean(value)
    return value.strftime("%Y-%m-%d %H:%M %Z").strip() if isinstance(value, datetime) else clean(value)


def render(event_type: str, payload: dict[str, Any], settings: Settings) -> tuple[str, str, str]:
    """Devuelve (destinatario, asunto, cuerpo). Importes y datos comerciales vienen del payload/configuración."""
    if event_type == "subscription_reminder":
        days = int(payload["reminder_days"])
        when = {3: "en 3 días", 1: "mañana", 0: "hoy"}[days]
        subject = f"Tu suscripción PRO vence {when}" if days else "Tu suscripción PRO vence hoy"
        body = "\n".join(
            [
                "Tu suscripción a JW Solutions PRO está próxima a vencer.",
                "",
                f"Fecha de vencimiento: {_fmt_date(payload['expires_at'])}",
                "",
                "Puedes renovar tu acceso a Code Formatter & Auto-Doc AI (Auto-Doc AI, documentación ampliada,",
                "funciones avanzadas de procesamiento y control de acceso mediante sesión única).",
                "",
                "Renovación mediante Binance Pay",
                f"Destinatario: {settings.payment_recipient_id}",
                f"Plan actual: {clean(payload.get('plan_name', settings.pro_plan_name))}",
                f"Importe de renovación: {clean(payload.get('renewal_amount') or settings.pro_renewal_amount)}",
                "",
                "Cuando realices la transferencia, conserva el identificador de transacción y repórtalo desde tu cuenta.",
                "La renovación quedará pendiente hasta verificar el pago.",
                "",
                "Gracias por utilizar JW Solutions.",
            ]
        )
        return clean(payload["to"], 254), subject, body

    if event_type == "payment_approved":
        body = "\n".join(
            [
                "Tu pago fue verificado y tu suscripción PRO está activa.",
                "",
                f"Vigente hasta: {_fmt_date(payload['expires_at'])}",
                "",
                "Gracias por utilizar JW Solutions.",
            ]
        )
        return clean(payload["to"], 254), "Suscripción PRO activada", body

    if event_type in ("payment_evidence_alert", "imap_alert"):
        lines = [f"{k}: {clean(v)}" for k, v in sorted(payload.items()) if k != "subject"]
        subject = clean(payload.get("subject") or "Alerta de conciliación de pagos", 120)
        return settings.mail_to, f"[JW Payments] {subject}", "\n".join(lines)

    raise PermanentDeliveryError(f"evento desconocido: {event_type}")


def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
    try:
        recipient = validate_email(to, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise PermanentDeliveryError(f"destinatario inválido: {exc}") from exc

    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.mail_host, settings.mail_port, timeout=30) as smtp:
        smtp.starttls(context=context)
        if settings.mail_username:
            smtp.login(settings.mail_username, settings.mail_password.get_secret_value())
        smtp.send_message(message)
