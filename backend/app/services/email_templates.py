"""Plantillas de correo Dark Glass Gold (#0B0E12 / #171B22 / #FBB200) con versión texto plano.

Seguridad: escape HTML estricto de todo campo dinámico; cero secretos, tokens internos ni PII innecesaria.
"""
from __future__ import annotations

from html import escape


def _base_lang(lang: str | None) -> str:
    raw = str(lang or "es").strip().lower()
    if raw.startswith("en"):
        return "en"
    if raw.startswith("pt"):
        return "pt"
    if raw.startswith("fr"):
        return "fr"
    if raw.startswith("de"):
        return "de"
    if raw.startswith("it"):
        return "it"
    return "es"


def _wrap_dark_glass_html(*, title: str, preheader: str, badge: str, body_paragraphs: list[str], cta_label: str, cta_url: str, footer_html: str) -> str:
    paras = "\n".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#E8EDF3;">{escape(p)}</p>'
        for p in body_paragraphs
    )
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)}</title></head>"
        '<body style="margin:0;padding:24px 12px;background:#0B0E12;font-family:Arial,Helvetica,sans-serif;color:#E8EDF3;">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#171B22;border:1px solid rgba(251,178,0,0.32);border-radius:14px;overflow:hidden;">'
        '<tr><td style="padding:24px 28px 16px;border-bottom:1px solid rgba(251,178,0,0.18);">'
        '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(251,178,0,0.14);color:#FBB200;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">'
        f"{escape(badge)}</span>"
        f'<h1 style="margin:12px 0 0;font-size:21px;line-height:1.3;color:#FFFFFF;">{escape(title)}</h1>'
        "</td></tr>"
        f'<tr><td style="padding:22px 28px;">{paras}'
        '<p style="margin:22px 0 6px;">'
        f'<a href="{escape(cta_url, quote=True)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#FBB200;color:#0B0E12;font-weight:700;font-size:14px;text-decoration:none;">'
        f"{escape(cta_label)}</a></p>"
        "</td></tr>"
        f'<tr><td style="padding:16px 28px;background:#0B0E12;border-top:1px solid rgba(251,178,0,0.14);font-size:12px;line-height:1.5;color:#9BA6B2;">{footer_html}</td></tr>'
        "</table></body></html>"
    )


def render_newsletter_welcome(*, channel: str, lang: str, unsubscribe_url: str) -> tuple[str, str, str]:
    """Correo de bienvenida al boletín (con baja en 1 clic)."""
    loc = _base_lang(lang)
    is_cf = channel == "code-formatter"

    if loc == "en":
        badge = "Code Formatter & Auto-Doc AI" if is_cf else "JW Solutions"
        subject = (
            "Welcome to Weekly Code Tips · Code Formatter & Auto-Doc AI"
            if is_cf
            else "Welcome to the JW Solutions Newsletter"
        )
        p1 = (
            "Your subscription is confirmed. Each week you will receive concise syntax tips, refactoring patterns, and Auto-Doc AI practices."
            if is_cf
            else "Your subscription to JW Solutions is confirmed. You will receive practical guides on automation, BI, and software engineering."
        )
        p2 = "No spam, no noise — only actionable technical material."
        cta_label = "Open Code Formatter & Academy" if is_cf else "Explore JW Solutions"
        unsub_label = "Unsubscribe in one click"
    else:
        badge = "Code Formatter & Auto-Doc AI" if is_cf else "JW Solutions"
        subject = (
            "Bienvenido a Tips Semanales · Code Formatter & Auto-Doc AI"
            if is_cf
            else "Bienvenido al boletín de JW Solutions"
        )
        p1 = (
            "Tu suscripción está confirmada. Cada semana recibirás tips prácticos de sintaxis, patrones de refactorización y flujos de Auto-Doc AI."
            if is_cf
            else "Tu suscripción a JW Solutions está confirmada. Recibirás guías prácticas de automatización, BI e ingeniería de software."
        )
        p2 = "Sin spam ni ruido: solo contenido técnico aplicable."
        cta_label = "Abrir Code Formatter y Academia" if is_cf else "Explorar JW Solutions"
        unsub_label = "Darse de baja en un clic"

    cta_url = "https://jw-solutions.com/tools/code-formatter/" if is_cf else "https://jw-solutions.com/"
    text_body = "\n".join(
        [
            subject,
            "",
            p1,
            p2,
            "",
            f"{cta_label}: {cta_url}",
            "",
            f"{unsub_label}: {unsubscribe_url}",
        ]
    )
    footer_html = (
        f'© JW Solutions · <a href="{escape(unsubscribe_url, quote=True)}" style="color:#FBB200;text-decoration:underline;">'
        f"{escape(unsub_label)}</a>"
    )
    html_body = _wrap_dark_glass_html(
        title=subject,
        preheader=p1,
        badge=badge,
        body_paragraphs=[p1, p2],
        cta_label=cta_label,
        cta_url=cta_url,
        footer_html=footer_html,
    )
    return subject, text_body, html_body


def render_purchase_welcome(
    *,
    plan_id: str,
    days: int,
    order_code: str,
    channel: str,
    expires_at: str,
    lang: str = "es",
) -> tuple[str, str, str]:
    """Correo transaccional de bienvenida tras confirmar pago y activar pase PRO."""
    loc = _base_lang(lang)
    if loc == "en":
        subject = f"Welcome to JW Solutions PRO · Order {order_code}"
        p1 = "Your payment has been verified and your PRO pass is now active on your account."
        p2 = f"Order: {order_code} · Plan: {plan_id} (+{days} days) · Channel: {channel} · Active until: {expires_at}"
        p3 = "You now have full access to Code Formatter & Auto-Doc AI PRO, Academy levels 1–5, and verifiable certificates."
        cta_label = "Start in Academy PRO"
        footer_note = "Transactional confirmation from JW Solutions. Keep your order code for your records."
    else:
        subject = f"Bienvenido a JW Solutions PRO · Orden {order_code}"
        p1 = "Tu pago fue verificado automáticamente y tu pase PRO ya está activo en tu cuenta."
        p2 = f"Orden: {order_code} · Plan: {plan_id} (+{days} días) · Canal: {channel} · Vigente hasta: {expires_at}"
        p3 = "Ya tienes acceso completo a Code Formatter & Auto-Doc AI PRO, niveles 1–5 de la Academia y certificados verificables."
        cta_label = "Entrar a Academia PRO"
        footer_note = "Confirmación transaccional de JW Solutions. Conserva tu código de orden como comprobante."

    cta_url = "https://jw-solutions.com/tools/code-formatter/?mode=learn"
    text_body = "\n".join(
        [
            subject,
            "",
            p1,
            p2,
            p3,
            "",
            f"{cta_label}: {cta_url}",
            "",
            footer_note,
        ]
    )
    html_body = _wrap_dark_glass_html(
        title=subject,
        preheader=p1,
        badge="JW Solutions PRO",
        body_paragraphs=[p1, p2, p3],
        cta_label=cta_label,
        cta_url=cta_url,
        footer_html=escape(footer_note),
    )
    return subject, text_body, html_body


def render_birthday_greeting(*, lang: str = "es", year: int | None = None) -> tuple[str, str, str]:
    """Saludo anual sobrio y no invasivo de cumpleaños (sin exponer fechas ni PII)."""
    loc = _base_lang(lang)
    if loc == "en":
        subject = "Happy Birthday from JW Solutions"
        p1 = "From the JW Solutions team, we wish you a great birthday and a year full of clean code and solid projects."
        p2 = "Thank you for being part of our developer community."
        cta_label = "Visit Code Formatter"
        footer_note = "© JW Solutions · Annual greeting sent because you shared an optional birthday on your account."
    else:
        subject = "Feliz cumpleaños de parte de JW Solutions"
        p1 = "Desde el equipo de JW Solutions te deseamos un excelente cumpleaños y un año lleno de proyectos sólidos y código limpio."
        p2 = "Gracias por formar parte de nuestra comunidad de desarrolladores."
        cta_label = "Visitar Code Formatter"
        footer_note = "© JW Solutions · Saludo anual enviado porque registraste una fecha opcional en tu cuenta."

    cta_url = "https://jw-solutions.com/tools/code-formatter/"
    text_body = "\n".join([subject, "", p1, p2, "", f"{cta_label}: {cta_url}", "", footer_note])
    html_body = _wrap_dark_glass_html(
        title=subject,
        preheader=p1,
        badge=f"JW Solutions · {year}" if year else "JW Solutions",
        body_paragraphs=[p1, p2],
        cta_label=cta_label,
        cta_url=cta_url,
        footer_html=escape(footer_note),
    )
    return subject, text_body, html_body
