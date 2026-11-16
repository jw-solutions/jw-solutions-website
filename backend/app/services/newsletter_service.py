from __future__ import annotations

import html
import smtplib
import socket
import ssl
from email.message import EmailMessage
from typing import Any
from urllib.parse import quote

from email_validator import EmailNotValidError, validate_email

from app.core.config import Settings
from app.services.notification_service import PermanentDeliveryError, clean

SUPPORTED_LANGS: tuple[str, ...] = ("es", "en", "pt-BR", "pt-PT", "fr", "de", "it")
ALLOWED_CHANNELS: tuple[str, ...] = ("main-website", "code-formatter")
SITE_URL = "https://jw-solutions.com"
CF_TOOL_URL = "https://jw-solutions.com/tools/code-formatter/"

_CF_EMAIL_COPY: dict[str, dict[str, str]] = {
    "es": {
        "badge": "CODE FORMATTER · TIP TÉCNICO",
        "cta": "Leer tip completo",
        "try_cta": "Probar fragmento en el editor",
        "academy_cta": "Practicar en Modo Academia",
        "unsub": "Darme de baja de este boletín",
        "footer": "Recibiste este correo porque te suscribiste a Code Formatter & Auto-Doc AI en jw-solutions.com.",
        "fallback_title": "Nuevo tip de código",
    },
    "en": {
        "badge": "CODE FORMATTER · TECH TIP",
        "cta": "Read full tip",
        "try_cta": "Try snippet in the editor",
        "academy_cta": "Practice in Academy Mode",
        "unsub": "Unsubscribe from this newsletter",
        "footer": "You received this email because you subscribed to Code Formatter & Auto-Doc AI at jw-solutions.com.",
        "fallback_title": "New code formatting tip",
    },
    "pt-BR": {
        "badge": "CODE FORMATTER · DICA TÉCNICA",
        "cta": "Ler dica completa",
        "try_cta": "Testar trecho no editor",
        "academy_cta": "Praticar no Modo Academia",
        "unsub": "Cancelar inscrição nesta newsletter",
        "footer": "Você recebeu este e-mail porque se inscreveu no Code Formatter & Auto-Doc AI em jw-solutions.com.",
        "fallback_title": "Nova dica de código",
    },
    "pt-PT": {
        "badge": "CODE FORMATTER · DICA TÉCNICA",
        "cta": "Ler dica completa",
        "try_cta": "Experimentar excerto no editor",
        "academy_cta": "Praticar no Modo Academia",
        "unsub": "Cancelar subscrição desta newsletter",
        "footer": "Recebeu este e-mail porque subscreveu o Code Formatter & Auto-Doc AI em jw-solutions.com.",
        "fallback_title": "Nova dica de código",
    },
    "fr": {
        "badge": "CODE FORMATTER · ASTUCE TECH",
        "cta": "Lire l'astuce complète",
        "try_cta": "Tester l'extrait dans l'éditeur",
        "academy_cta": "Pratiquer en Mode Académie",
        "unsub": "Se désabonner de cette newsletter",
        "footer": "Vous avez reçu cet e-mail car vous êtes abonné à Code Formatter & Auto-Doc AI sur jw-solutions.com.",
        "fallback_title": "Nouvelle astuce de code",
    },
    "de": {
        "badge": "CODE FORMATTER · TECH-TIPP",
        "cta": "Vollständigen Tipp lesen",
        "try_cta": "Snippet im Editor testen",
        "academy_cta": "Im Akademie-Modus üben",
        "unsub": "Von diesem Newsletter abmelden",
        "footer": "Sie erhalten diese E-Mail, weil Sie Code Formatter & Auto-Doc AI auf jw-solutions.com abonniert haben.",
        "fallback_title": "Neuer Code-Tipp",
    },
    "it": {
        "badge": "CODE FORMATTER · SUGGERIMENTO",
        "cta": "Leggi il suggerimento completo",
        "try_cta": "Prova lo snippet nell'editor",
        "academy_cta": "Pratica in Modalità Accademia",
        "unsub": "Annulla l'iscrizione a questa newsletter",
        "footer": "Hai ricevuto questa e-mail perché ti sei iscritto a Code Formatter & Auto-Doc AI su jw-solutions.com.",
        "fallback_title": "Nuovo suggerimento di codice",
    },
}

_UNSUB_COPY: dict[str, dict[str, str]] = {
    "es": {
        "ok_title": "Baja confirmada",
        "ok_heading": "Te has dado de baja correctamente",
        "ok_msg_main": "Ya no recibirás correos semanales del boletín de JW Solutions. Puedes volver a suscribirte cuando quieras desde nuestra web.",
        "ok_msg_cf": "Ya no recibirás tips semanales de Code Formatter & Auto-Doc AI. Puedes volver a suscribirte cuando quieras desde la herramienta.",
        "err_title": "Enlace no válido",
        "err_heading": "Enlace de baja no válido o expirado",
        "err_msg": "No pudimos encontrar una suscripción activa asociada a este enlace.",
        "back_main": "Volver a jw-solutions.com",
        "back_cf": "Volver a Code Formatter",
    },
    "en": {
        "ok_title": "Unsubscribed",
        "ok_heading": "You have been unsubscribed",
        "ok_msg_main": "You will no longer receive weekly emails from the JW Solutions newsletter. You can resubscribe anytime on our website.",
        "ok_msg_cf": "You will no longer receive tips from Code Formatter & Auto-Doc AI. You can resubscribe anytime from the tool.",
        "err_title": "Invalid link",
        "err_heading": "Invalid or expired unsubscribe link",
        "err_msg": "We could not find an active subscription associated with this link.",
        "back_main": "Back to jw-solutions.com",
        "back_cf": "Back to Code Formatter",
    },
    "pt-BR": {
        "ok_title": "Inscrição cancelada",
        "ok_heading": "Você cancelou sua inscrição",
        "ok_msg_main": "Você não receberá mais e-mails semanais da JW Solutions. Você pode se inscrever novamente quando quiser.",
        "ok_msg_cf": "Você não receberá mais dicas do Code Formatter & Auto-Doc AI. Você pode se inscrever novamente quando quiser.",
        "err_title": "Link inválido",
        "err_heading": "Link de cancelamento inválido ou expirado",
        "err_msg": "Não foi possível encontrar uma assinatura ativa associada a este link.",
        "back_main": "Voltar para jw-solutions.com",
        "back_cf": "Voltar para o Code Formatter",
    },
    "pt-PT": {
        "ok_title": "Subscrição cancelada",
        "ok_heading": "Subscrição cancelada com sucesso",
        "ok_msg_main": "Já não receberá e-mails semanais da JW Solutions. Pode voltar a subscrever quando quiser.",
        "ok_msg_cf": "Já não receberá dicas do Code Formatter & Auto-Doc AI. Pode voltar a subscrever quando quiser.",
        "err_title": "Ligação inválida",
        "err_heading": "Ligação de cancelamento inválida ou expirada",
        "err_msg": "Não foi possível encontrar uma subscrição ativa associada a esta ligação.",
        "back_main": "Voltar a jw-solutions.com",
        "back_cf": "Voltar ao Code Formatter",
    },
    "fr": {
        "ok_title": "Désabonnement confirmé",
        "ok_heading": "Vous êtes bien désabonné",
        "ok_msg_main": "Vous ne recevrez plus les e-mails hebdomadaires de JW Solutions. Vous pouvez vous réabonner à tout moment.",
        "ok_msg_cf": "Vous ne recevrez plus les astuces de Code Formatter & Auto-Doc AI. Vous pouvez vous réabonner à tout moment.",
        "err_title": "Lien invalide",
        "err_heading": "Lien de désabonnement invalide ou expiré",
        "err_msg": "Nous n'avons trouvé aucun abonnement actif associé à ce lien.",
        "back_main": "Retour à jw-solutions.com",
        "back_cf": "Retour à Code Formatter",
    },
    "de": {
        "ok_title": "Abmeldung bestätigt",
        "ok_heading": "Sie wurden erfolgreich abgemeldet",
        "ok_msg_main": "Sie erhalten keine wöchentlichen E-Mails mehr von JW Solutions. Sie können sich jederzeit wieder anmelden.",
        "ok_msg_cf": "Sie erhalten keine Tipps mehr von Code Formatter & Auto-Doc AI. Sie können sich jederzeit wieder anmelden.",
        "err_title": "Ungültiger Link",
        "err_heading": "Ungültiger oder abgelaufener Abmeldelink",
        "err_msg": "Es konnte kein aktives Abonnement für diesen Link gefunden werden.",
        "back_main": "Zurück zu jw-solutions.com",
        "back_cf": "Zurück zu Code Formatter",
    },
    "it": {
        "ok_title": "Disiscrizione confermata",
        "ok_heading": "Ti sei disiscritto correttamente",
        "ok_msg_main": "Non riceverai più le e-mail settimanali di JW Solutions. Puoi iscriverti di nuovo in qualsiasi momento.",
        "ok_msg_cf": "Non riceverai più i suggerimenti di Code Formatter & Auto-Doc AI. Puoi iscriverti di nuovo in qualsiasi momento.",
        "err_title": "Link non valido",
        "err_heading": "Link di disiscrizione non valido o scaduto",
        "err_msg": "Non abbiamo trovato alcuna iscrizione attiva associata a questo link.",
        "back_main": "Torna a jw-solutions.com",
        "back_cf": "Torna a Code Formatter",
    },
}


def normalize_lang(raw: str | None, default: str = "en") -> str:
    """Normaliza un código de idioma a uno de los 7 oficiales; fallback a `default`."""
    val = str(raw or "").strip().lower()
    if not val:
        return default
    if val in ("pt", "pt-br", "pt_br"):
        return "pt-BR"
    if val in ("pt-pt", "pt_pt"):
        return "pt-PT"
    for official in SUPPORTED_LANGS:
        if val == official.lower():
            return official
    base = val.split("-")[0].split("_")[0]
    if base in ("es", "en", "fr", "de", "it"):
        return base
    return default


def _safe_https_url(raw: str | None, fallback: str) -> str:
    url = str(raw or "").strip()
    return url if url.startswith("https://") else fallback


def _render_code_formatter_email(
    article: dict[str, Any],
    lang: str,
    unsubscribe_url: str,
) -> tuple[str, str, str]:
    norm_lang = normalize_lang(lang, default="en")
    copy = _CF_EMAIL_COPY[norm_lang]

    locales: dict[str, Any] = article.get("locales") or {}
    loc_data = locales.get(norm_lang) or locales.get("en") or locales.get("es") or {}

    title = clean(
        loc_data.get("title")
        or article.get(f"title_{norm_lang}")
        or article.get("title_en")
        or article.get("title_es")
        or article.get("title")
        or copy["fallback_title"],
        160,
    )
    summary = clean(
        loc_data.get("summary")
        or article.get(f"summary_{norm_lang}")
        or article.get("summary_en")
        or article.get("summary_es")
        or article.get("summary")
        or "",
        500,
    )
    url = _safe_https_url(
        loc_data.get("url")
        or article.get(f"url_{norm_lang}")
        or article.get("url_en")
        or article.get("url_es")
        or article.get("url"),
        CF_TOOL_URL,
    )

    prog_lang = str(article.get("programming_language") or "").strip()
    snippet = str(article.get("interactive_snippet") or "").strip()
    try_url = ""
    if snippet:
        try_url = f"{CF_TOOL_URL}?lang={quote(norm_lang)}&snippet={quote(snippet[:2000])}"
        if prog_lang:
            try_url += f"&code_lang={quote(prog_lang)}"

    academy_topic = quote((prog_lang or "python").lower())
    academy_url = f"{CF_TOOL_URL}?mode=learn&lang={quote(norm_lang)}&topic={academy_topic}&utm_source=newsletter&utm_medium=email"

    badge_text = f"{copy['badge']} · {prog_lang.upper()}" if prog_lang else copy["badge"]
    subject = f"[Code Formatter AI] {title}"

    text_lines = [
        "CODE FORMATTER & AUTO-DOC AI · JW SOLUTIONS",
        "",
        title,
        "",
        summary,
        "",
        f"{copy['cta']}: {url}",
    ]
    if try_url:
        text_lines.append(f"{copy['try_cta']}: {try_url}")
    text_lines.append(f"{copy['academy_cta']}: {academy_url}")
    text_lines.extend(["", "---", copy["footer"], f"{copy['unsub']}: {unsubscribe_url}"])
    text_body = "\n".join(text_lines)

    esc_title = html.escape(title)
    esc_summary = html.escape(summary)
    esc_url = html.escape(url, quote=True)
    esc_academy_url = html.escape(academy_url, quote=True)
    esc_academy_cta = html.escape(copy["academy_cta"])
    esc_unsub = html.escape(unsubscribe_url, quote=True)
    esc_badge = html.escape(badge_text)
    esc_cta = html.escape(copy["cta"])
    esc_try_cta = html.escape(copy["try_cta"])
    esc_unsub_label = html.escape(copy["unsub"])
    esc_footer = html.escape(copy["footer"])

    secondary_btn = ""
    if try_url:
        esc_try_url = html.escape(try_url, quote=True)
        secondary_btn = (
            f'<td style="padding-left:12px;">'
            f'<a href="{esc_try_url}" target="_blank" rel="noopener noreferrer" '
            f'style="display:inline-block;padding:13px 20px;border:1px solid #D4AF37;color:#D4AF37;'
            f'font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">{esc_try_cta}</a>'
            f"</td>"
        )

    html_body = f"""<!DOCTYPE html>
<html lang="{html.escape(norm_lang)}">
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
            <td style="padding:26px 32px 20px;border-bottom:1px solid rgba(212,175,55,0.25);">
              <span style="display:inline-block;background-color:#D4AF37;color:#0B0E12;font-weight:800;font-size:14px;padding:6px 10px;border-radius:6px;letter-spacing:1px;">CF</span>
              <span style="color:#FFFFFF;font-weight:700;font-size:15px;letter-spacing:1.5px;margin-left:10px;vertical-align:middle;">CODE FORMATTER <span style="color:#D4AF37;">AI</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 12px;color:#D4AF37;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{esc_badge}</p>
              <h1 style="margin:0 0 16px;color:#FFFFFF;font-size:23px;line-height:1.3;font-weight:700;">{esc_title}</h1>
              <p style="margin:0 0 28px;color:#D1D5DB;font-size:15px;line-height:1.6;">{esc_summary}</p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:8px;background-color:#D4AF37;">
                    <a href="{esc_url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;color:#0B0E12;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">{esc_cta} &rarr;</a>
                  </td>
                  {secondary_btn}
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:13px;">
                <a href="{esc_academy_url}" target="_blank" rel="noopener noreferrer" style="color:#D4AF37;text-decoration:underline;font-weight:600;">{esc_academy_cta} &rarr;</a>
              </p>
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


def render_newsletter_email(
    article: dict[str, Any],
    lang: str,
    unsubscribe_url: str,
    channel: str = "main-website",
) -> tuple[str, str, str]:
    """Renderiza (subject, text_body, html_body) en estética Dark Gold para el canal indicado."""
    if channel == "code-formatter":
        return _render_code_formatter_email(article, lang, unsubscribe_url)

    norm_lang = "en" if lang == "en" else "es"

    title = clean(
        article.get(f"title_{norm_lang}") or article.get("title_es") or article.get("title") or "Nuevo artículo",
        160,
    )
    summary = clean(
        article.get(f"summary_{norm_lang}") or article.get("summary_es") or article.get("summary") or "",
        500,
    )
    url = _safe_https_url(
        article.get(f"url_{norm_lang}") or article.get("url_es") or article.get("url"),
        f"{SITE_URL}/",
    )

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


def render_unsubscribe_page(found: bool, lang: str, channel: str = "main-website") -> str:
    """Genera página HTML de confirmación de baja localizada en 7 idiomas y con branding por canal."""
    norm_lang = normalize_lang(lang, default="es")
    copy = _UNSUB_COPY[norm_lang]
    is_cf = channel == "code-formatter"

    brand = "CODE FORMATTER & AUTO-DOC AI" if is_cf else "JW SOLUTIONS"
    back_url = CF_TOOL_URL if is_cf else f"{SITE_URL}/"
    back_label = copy["back_cf"] if is_cf else copy["back_main"]

    if found:
        title = f"{copy['ok_title']} | {brand}"
        heading = copy["ok_heading"]
        msg = copy["ok_msg_cf"] if is_cf else copy["ok_msg_main"]
    else:
        title = f"{copy['err_title']} | {brand}"
        heading = copy["err_heading"]
        msg = copy["err_msg"]

    return f"""<!DOCTYPE html>
<html lang="{html.escape(norm_lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)}</title>
</head>
<body style="margin:0;padding:40px 16px;background:#0B0E12;color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:80vh;">
  <div style="max-width:480px;width:100%;background:#111827;border:1px solid #D4AF37;border-radius:14px;padding:32px;text-align:center;">
    <div style="display:inline-block;background:#D4AF37;color:#0B0E12;font-weight:800;padding:6px 12px;border-radius:6px;letter-spacing:1px;margin-bottom:16px;">{html.escape(brand)}</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#FFFFFF;">{html.escape(heading)}</h1>
    <p style="margin:0 0 24px;color:#D1D5DB;line-height:1.6;font-size:15px;">{html.escape(msg)}</p>
    <a href="{html.escape(back_url, quote=True)}" style="display:inline-block;padding:12px 24px;background:#D4AF37;color:#0B0E12;font-weight:700;text-decoration:none;border-radius:8px;">{html.escape(back_label)}</a>
  </div>
</body>
</html>"""


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
