// Utilidades HTTP: lectura segura de JSON, limitador de tasa, IP del cliente y CORS con credenciales.
export async function readJson(req, maxBytes = 16 * 1024) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return { error: 'content_type' };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) return { error: 'too_large' };
    chunks.push(chunk);
  }
  try { return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; } catch { return { error: 'bad_json' }; }
}

/** Ventana fija por clave. hit() -> true si aún se permite. */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      let h = hits.get(key);
      if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
      h.count += 1;
      return h.count <= max;
    },
  };
}

export function clientIp(req, trustProxy = process.env.TRUST_PROXY === '1') {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1]; // el último salto añadido por NUESTRO proxy
  }
  return req.socket.remoteAddress || 'unknown';
}

/** Aplica CORS solo para el origen exacto permitido. Devuelve true si la petición era un preflight ya respondido. */
export function applyCors(req, res, allowedOrigin) {
  if (req.headers.origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      res.end();
      return true;
    }
  } else if (req.method === 'OPTIONS') {
    res.writeHead(403);
    res.end();
    return true;
  }
  return false;
}
