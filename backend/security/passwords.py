#!/usr/bin/env python3
"""Hash y verificación de contraseñas con Argon2id (argon2-cffi).

Uso como biblioteca:  hash_password / verify_password / needs_rehash.
Uso como worker (lo invoca backend/code-formatter/src/passwords.js):
    python passwords.py --worker
Protocolo: una línea JSON por petición en stdin, una línea JSON por respuesta en stdout.
La contraseña viaja por stdin, nunca por argumentos de línea de comandos.
    {"id": 1, "op": "hash",   "password": "..."}                  -> {"id": 1, "ok": true, "hash": "$argon2id$..."}
    {"id": 2, "op": "verify", "password": "...", "hash": "..."}   -> {"id": 2, "ok": true, "valid": true, "rehash": false}
"""
from __future__ import annotations

import json
import sys

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Parámetros OWASP (≥ 19 MiB, t=2, p=1) con holgura: 64 MiB, t=3, p=4.
_HASHER = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4, hash_len=32, salt_len=16, type=Type.ID)
MAX_PASSWORD_BYTES = 1024


def hash_password(password: str) -> str:
    if not isinstance(password, str) or not password or len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("password inválida")
    return _HASHER.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    if not isinstance(password, str) or len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return False
    try:
        return _HASHER.verify(stored_hash, password)
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _HASHER.check_needs_rehash(stored_hash)
    except InvalidHashError:
        return True


def _handle(req: dict) -> dict:
    op = req.get("op")
    if op == "hash":
        return {"ok": True, "hash": hash_password(req["password"])}
    if op == "verify":
        valid = verify_password(req["hash"], req["password"])
        return {"ok": True, "valid": valid, "rehash": bool(valid and needs_rehash(req["hash"]))}
    return {"ok": False, "error": "op desconocida"}


def run_worker() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            res = _handle(req)
        except Exception as exc:  # noqa: BLE001 - el worker no debe caer por una petición mala
            res = {"ok": False, "error": type(exc).__name__}
        res["id"] = req_id
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    if "--worker" in sys.argv:
        sys.exit(run_worker())
    print(__doc__)
