// Arranque con PostgreSQL real.
// Variables: DATABASE_URL, ALLOWED_ORIGIN, PORT, PYTHON_BIN, TRUST_PROXY=1 (tras proxy),
//            SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM (alertas a contact@jw-solutions.com).
import http from 'node:http';
import pg from 'pg';
import { createApi } from './app.js';
import { createRevocationBus, pgListen } from './events.js';
import { createPasswordService } from './passwords.js';
import { createMailer } from './mailer.js';
import { startOutboxWorker } from './outbox.js';

const { DATABASE_URL, ALLOWED_ORIGIN, PORT = 8787 } = process.env;
if (!DATABASE_URL || !ALLOWED_ORIGIN) {
  console.error('Faltan DATABASE_URL o ALLOWED_ORIGIN');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
const bus = createRevocationBus(pgListen(pool));
await bus.ready;

const api = createApi({ pool, bus, passwords: createPasswordService(), allowedOrigin: ALLOWED_ORIGIN });

const send = await createMailer();
if (send) startOutboxWorker(pool, { send });
else console.warn('SMTP no configurado: las alertas quedan en notification_outbox hasta que se configure.');

http.createServer(async (req, res) => {
  if (!(await api(req, res))) { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log(`cf-backend escuchando en :${PORT}`));
