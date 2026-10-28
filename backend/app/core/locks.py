from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, text

# Claves de advisory lock por proceso (exclusión mutua entre instancias del mismo worker).
LOCK_IMAP = 7_001_001
LOCK_EXPIRATION = 7_001_002


@contextmanager
def advisory_lock(engine: Engine, key: int) -> Iterator[bool]:
    """Lock de sesión de PostgreSQL en una conexión dedicada. Entrega False si otro proceso lo tiene."""
    with engine.connect() as conn:
        acquired = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key}).scalar())
        conn.commit()
        try:
            yield acquired
        finally:
            if acquired:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})
                conn.commit()
