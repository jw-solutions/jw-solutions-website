from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from app.core.config import Settings

TWO_DP = Decimal("0.01")


class PayPalAPIError(RuntimeError):
    """Error controlado al comunicarse con la API REST de PayPal (sin exponer secretos)."""


def calculate_paypal_pricing(base_amount: Decimal, settings: Settings) -> dict[str, Any]:
    """Calcula desglose exacto en Decimal (ROUND_HALF_UP) sin doble conversión de moneda."""
    base = Decimal(str(base_amount)).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    currency = settings.paypal_currency

    if not settings.paypal_pass_fees_to_client:
        return {
            "base_amount": base,
            "fee_amount": Decimal("0.00"),
            "total_amount": base,
            "currency": currency,
            "pass_fees_to_client": False,
        }

    raw_percent = Decimal(str(settings.paypal_fee_percent))
    # Acepta tanto tasa decimal (0.054) como porcentaje entero/decimal (5.4)
    rate = (raw_percent / Decimal("100")) if raw_percent >= Decimal("1") else raw_percent
    if rate < Decimal("0") or rate >= Decimal("0.50"):
        raise ValueError("Tasa de comisión PayPal fuera de rango seguro")

    fixed = Decimal(str(settings.paypal_fee_fixed))
    total = ((base + fixed) / (Decimal("1") - rate)).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    fee = (total - base).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    return {
        "base_amount": base,
        "fee_amount": fee,
        "total_amount": total,
        "currency": currency,
        "pass_fees_to_client": True,
    }


def _http_json(
    url: str,
    *,
    method: str = "POST",
    headers: dict[str, str],
    body: bytes | None = None,
    timeout: int = 15,
) -> dict[str, Any]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raise PayPalAPIError(f"PayPal HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise PayPalAPIError(f"Error de red/JSON con PayPal: {type(exc).__name__}") from exc


def get_paypal_access_token(settings: Settings) -> str:
    """Obtiene token OAuth2 client_credentials desde PayPal sin loguear credenciales."""
    client_id = settings.paypal_client_id.strip()
    client_secret = settings.paypal_client_secret.get_secret_value().strip()
    if not client_id or not client_secret:
        raise PayPalAPIError("Credenciales PayPal no configuradas")

    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    data = _http_json(
        f"{settings.paypal_api_base}/v1/oauth2/token",
        method="POST",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        body=b"grant_type=client_credentials",
    )
    token = str(data.get("access_token") or "").strip()
    if not token:
        raise PayPalAPIError("Respuesta OAuth2 de PayPal sin access_token")
    return token


def create_paypal_order(
    settings: Settings,
    *,
    order_code: str,
    plan_id: str,
    total_amount: Decimal,
    currency: str,
) -> tuple[str, str]:
    """Crea una orden en PayPal Orders v2 y retorna (paypal_order_id, approve_url)."""
    token = get_paypal_access_token(settings)
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": plan_id,
                "custom_id": order_code,
                "description": f"JW Solutions {plan_id} ({order_code})",
                "amount": {
                    "currency_code": currency,
                    "value": f"{total_amount.quantize(TWO_DP, rounding=ROUND_HALF_UP):.2f}",
                },
            }
        ],
        "application_context": {
            "brand_name": "JW Solutions",
            "landing_page": "LOGIN",
            "user_action": "PAY_NOW",
            "return_url": settings.paypal_return_url.strip(),
            "cancel_url": settings.paypal_cancel_url.strip(),
        },
    }
    data = _http_json(
        f"{settings.paypal_api_base}/v2/checkout/orders",
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": order_code,
            "Prefer": "return=representation",
        },
        body=json.dumps(payload).encode("utf-8"),
    )
    paypal_order_id = str(data.get("id") or "").strip()
    approve_url = ""
    for link in data.get("links") or []:
        if isinstance(link, dict) and link.get("rel") in ("approve", "payer-action") and link.get("href"):
            approve_url = str(link["href"]).strip()
            break
    if not paypal_order_id or not approve_url or not approve_url.startswith("https://"):
        raise PayPalAPIError("Respuesta de orden PayPal incompleta o URL inválida")
    return paypal_order_id, approve_url


def capture_paypal_order(settings: Settings, *, paypal_order_id: str) -> dict[str, Any]:
    """Captura una orden aprobada en PayPal Orders v2 y devuelve datos normalizados."""
    clean_id = urllib.parse.quote(paypal_order_id.strip(), safe="")
    if not clean_id:
        raise PayPalAPIError("paypal_order_id vacío")
    token = get_paypal_access_token(settings)
    data = _http_json(
        f"{settings.paypal_api_base}/v2/checkout/orders/{clean_id}/capture",
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": f"capture-{clean_id}",
            "Prefer": "return=representation",
        },
        body=b"{}",
    )
    status = str(data.get("status") or "").upper()
    purchase_units = data.get("purchase_units") or []
    unit = purchase_units[0] if purchase_units and isinstance(purchase_units[0], dict) else {}
    captures = ((unit.get("payments") or {}).get("captures")) or []
    cap = captures[0] if captures and isinstance(captures[0], dict) else {}

    capture_status = str(cap.get("status") or status).upper()
    capture_id = str(cap.get("id") or "").strip()
    custom_id = str(cap.get("custom_id") or unit.get("custom_id") or "").strip().upper()
    amt_obj = cap.get("amount") or unit.get("amount") or {}
    currency = str(amt_obj.get("currency_code") or "").strip().upper()
    try:
        amount = Decimal(str(amt_obj.get("value") or "0")).quantize(TWO_DP, rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise PayPalAPIError("Monto capturado inválido en respuesta PayPal") from exc

    return {
        "order_status": status,
        "capture_status": capture_status,
        "paypal_order_id": str(data.get("id") or paypal_order_id).strip(),
        "capture_id": capture_id,
        "custom_id": custom_id,
        "amount": amount,
        "currency": currency,
    }


def verify_paypal_webhook_signature(
    settings: Settings,
    *,
    headers: dict[str, str],
    webhook_event: dict[str, Any],
) -> bool:
    """Verifica firma oficial del webhook llamando a /v1/notifications/verify-webhook-signature."""
    webhook_id = settings.paypal_webhook_id.get_secret_value().strip()
    if not webhook_id or not settings.paypal_rest_configured:
        return False

    lower = {k.lower(): v for k, v in headers.items()}
    required = {
        "transmission_id": lower.get("paypal-transmission-id", "").strip(),
        "transmission_time": lower.get("paypal-transmission-time", "").strip(),
        "cert_url": lower.get("paypal-cert-url", "").strip(),
        "auth_algo": lower.get("paypal-auth-algo", "").strip(),
        "transmission_sig": lower.get("paypal-transmission-sig", "").strip(),
    }
    if not all(required.values()):
        return False

    token = get_paypal_access_token(settings)
    payload = {
        "auth_algo": required["auth_algo"],
        "cert_url": required["cert_url"],
        "transmission_id": required["transmission_id"],
        "transmission_sig": required["transmission_sig"],
        "transmission_time": required["transmission_time"],
        "webhook_id": webhook_id,
        "webhook_event": webhook_event,
    }
    try:
        data = _http_json(
            f"{settings.paypal_api_base}/v1/notifications/verify-webhook-signature",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            body=json.dumps(payload).encode("utf-8"),
        )
    except PayPalAPIError:
        return False
    return str(data.get("verification_status") or "").upper() == "SUCCESS"
