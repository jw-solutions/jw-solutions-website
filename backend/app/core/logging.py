from __future__ import annotations

import logging
import sys

_FORMAT = "[%(asctime)s][%(component)s][%(levelname)s] %(message)s"


class _ComponentAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):  # type: ignore[override]
        kwargs.setdefault("extra", {})["component"] = self.extra["component"]
        return msg, kwargs


def get_logger(component: str) -> logging.LoggerAdapter:
    """Logger por proceso: JW-IMAP, JW-CRON, JW-OUTBOX, JW-API. No registrar secretos, cookies ni cuerpos de correo."""
    base = logging.getLogger(f"jw_solutions.{component.lower()}")
    if not base.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))
        base.addHandler(handler)
        base.setLevel(logging.INFO)
        base.propagate = False
    return _ComponentAdapter(base, {"component": component})
