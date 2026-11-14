from __future__ import annotations

import html
import smtplib
import socket
import ssl
from email.message import EmailMessage
from typing import Any

from email_validator import EmailNotValidError, validate_email

from app.core.config import Settings
from app.services.notification_service import PermanentDeliveryError, clean


def render_newsletter_email(article: dict[str, Any], lang: str, unsubscribe_url: str) -> tuple[str, str, str]:
    """Renderiza (subject, text_body, html_body) en estética Dark Gold para el artículo publicado."""
    norm_lang = "en" if lang == "en" else "es"

    title = clean(
        article.get(f"title_{norm_lang}") or article.get("title_es") or article.get("title") or "Nuevo artículo",
        160,
    )
    summary = clean(
        article.get(f"summary_{norm_lang}") or article.get("summary_es") or article.get("summary") or "",
        500,
    )
    url = str(
        article.get(f"url_{norm_lang}") or article.get("url_es") or article.get("url") or "https://jw-solutions.com/"
    ).strip()
    if not url.startswith("https://"):
        url = "https://jw-solutions.com/"

    if norm_lang == "en":
        badge = "WEEKLY DATA-DRIVEN BRIEF"
        cta_label = "Read full article"
        unsub_label = "Unsubscribe from this newsletter"
        footer_note = "You received this email because you subscribed at jw-solutions.com."
        subject = f"[JW Solutions] {title}"
    else:
        badge = "BOLETÍN SEMANAL DATA-DRIVEN"
        cta_label = "Leer artículo completo"
        unsub_label = "Darme de baja del boletín"
        footer_note = "Recibiste este correo porque te suscribiste en jw-solutions.com."
        subject = f"[JW Solutions] {title}"

    text_body = "\n".join(
        [
            "JW SOLUTIONS",
            "",
            title,
            "",
            summary,
            "",
            f"{cta_label}: {url}",
            "",
            "---",
            footer_note,
            f"{unsub_label}: {unsubscribe_url}",
        ]
    )

    esc_title = html.escape(title)
    esc_summary = html.escape(summary)
    esc_url = html.escape(url, quote=True)
    esc_unsub = html.escape(unsubscribe_url, quote=True)
    esc_badge = html.escape(badge)
    esc_cta = html.escape(cta_label)
    esc_unsub_label = html.escape(unsub_label)
    esc_footer = html.escape(footer_note)

    html_body = f"""<!DOCTYPE html>
<html lang="{norm_lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc_title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0B0E12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#F3F4F6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B0E12;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border:1px solid #D4AF37;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid rgba(212,175,55,0.25);">
              <span style="display:inline-block;background-color:#D4AF37;color:#0B0E12;font-weight:800;font-size:14px;padding:6px 10px;border-radius:6px;letter-spacing:1px;">JW</span>
              <span style="color:#FFFFFF;font-weight:700;font-size:15px;letter-spacing:3px;margin-left:10px;vertical-align:middle;">SOLUTIONS</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 12px;color:#D4AF37;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{esc_badge}</p>
              <h1 style="margin:0 0 16px;color:#FFFFFF;font-size:24px;line-height:1.3;font-weight:700;">{esc_title}</h1>
              <p style="margin:0 0 28px;color:#D1D5DB;font-size:16px;line-height:1.6;">{esc_summary}</p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:8px;background-color:#D4AF37;">
                    <a href="{esc_url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;color:#0B0E12;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">{esc_cta} &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.08);background-color:#0D1117;">
              <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;line-height:1.5;">{esc_footer}</p>
              <p style="margin:0;font-size:12px;"><a href="{esc_unsub}" style="color:#D4AF37;text-decoration:underline;">{esc_unsub_label}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return subject, text_body, html_body


class _IPv4SMTP(smtplib.SMTP):
    """Conecta por IPv4 conservando el hostname original para validación SNI/TLS."""

    def _get_socket(self, host: str, port: int, timeout: float | None) -> socket.socket:
        last_err: OSError | None = None
        for af, socktype, proto, _, sa in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
            sock = None
            try:
                sock = socket.socket(af, socktype, proto)
                if timeout is not None:
                    sock.settimeout(timeout)
                sock.connect(sa)
                return sock
            except OSError as exc:
                last_err = exc
                if sock is not None:
                    sock.close()
        raise last_err or OSError(f"No se pudo conectar por IPv4 a {host}:{port}")


def send_html_email(settings: Settings, to: str, subject: str, text_body: str, html_body: str) -> None:
    """Envía correo multipart/alternative (texto + HTML) reutilizando la configuración SMTP."""
    try:
        recipient = validate_email(to, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise PermanentDeliveryError(f"destinatario inválido: {exc}") from exc

    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    with _IPv4SMTP(settings.mail_host, settings.mail_port, timeout=30) as smtp:
        smtp.starttls(context=context)
        if settings.mail_username:
            smtp.login(settings.mail_username, settings.mail_password.get_secret_value())
        smtp.send_message(message)
