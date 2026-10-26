// Arranque con PostgreSQL real. Variables: DATABASE_URL, ALLOWED_ORIGIN, PORT, AUTH_MODULE (ruta a un módulo que exporte authenticate(req)).
import http from 'node:http';
import pg from 'pg';
import { createSessionApi } from './app.js';
import { createRevocationBus, pgListen } from './events.js';

const { DATABASE_URL, ALLOWED_ORIGIN, AUTH_MODULE, PORT = 8787 } = process.env;
if (!DATABASE_URL || !ALLOWED_ORIGIN || !AUTH_MODULE) {
  console.error('Faltan DATABASE_URL, ALLOWED_ORIGIN o AUTH_MODULE');
  process.exit(1);
}

const { authenticate } = await import(AUTH_MODULE);
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
const bus = createRevocationBus(pgListen(pool));
await bus.ready;

const api = createSessionApi({ pool, bus, authenticate, allowedOrigin: ALLOWED_ORIGIN });
http.createServer(async (req, res) => {
  if (!(await api(req, res))) { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log(`cf-backend escuchando en :${PORT}`));
