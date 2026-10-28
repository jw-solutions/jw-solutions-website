import os

# Entorno mínimo y ficticio para construir Settings en pruebas (nunca credenciales reales).
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
os.environ.setdefault("SESSION_SECRET", "x" * 40)
os.environ.setdefault("BINANCE_NOTIFICATION_SENDERS", "notify@binance.test")
os.environ.setdefault("TRUSTED_FORWARDERS", "fwd@forwarder.test")
os.environ.setdefault("IMAP_USERNAME", "mailbox@example.test")
