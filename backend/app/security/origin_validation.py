from __future__ import annotations

from collections.abc import Collection

from fastapi import HTTPException, Request

from app.core.config import get_settings

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Rutas de webhook exentas de Origin (se autentican con firma criptográfica propia). Vacío mientras no exista
# el endpoint de Binance Pay Merchant: añadirlo solo junto con su verificación RSA.
WEBHOOK_PATHS: frozenset[str] = frozenset()


def check_origin(method: str, path: str, origin: str | None, allowed: Collection[str]) -> None:
    """Rechaza (403) escrituras sin Origin o con Origin fuera de la lista exacta. Sin comodines ni 'null'."""
    if method.upper() not in UNSAFE_METHODS or path in WEBHOOK_PATHS:
        return
    if not origin:
        raise HTTPException(status_code=403, detail="Origin header required")
    if origin not in allowed:
        raise HTTPException(status_code=403, detail="Origin not allowed")


async def validate_request_origin(request: Request) -> None:
    """Dependencia global: se evalúa en todas las rutas de la aplicación."""
    check_origin(request.method, request.url.path, request.headers.get("origin"), get_settings().allowed_origins_list)
