// Compartir fragmentos por URL: ?snippet=<v><base64url>. v = "z" (deflate-raw nativo) o "p" (UTF-8 plano, sin CompressionStream).
// Todo ocurre en el navegador; el servidor nunca recibe el código. Al decodificar se limita el tamaño (anti zip-bomb).
import { MAX_CODE_BYTES } from './i18n.js';

export const MAX_SHARE_URL = 8000; // tope práctico de longitud de URL para WhatsApp/Slack/X

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

const toB64Url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { reader.cancel().catch(() => {}); throw new Error('too_big'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  chunks.forEach((c) => { out.set(c, off); off += c.length; });
  return out;
}

/** { lang, code } → payload compacto apto para URL. */
export async function encodeSnippet(code, lang) {
  const raw = enc.encode(JSON.stringify({ l: lang || '', c: code }));
  if (typeof CompressionStream === 'function') {
    try { return `z${toB64Url(await pipe(raw, new CompressionStream('deflate-raw')))}`; } catch { /* usa el formato plano */ }
  }
  return `p${toB64Url(raw)}`;
}

/** payload → { lang, code } o null si es inválido o demasiado grande. */
export async function decodeSnippet(payload) {
  try {
    if (typeof payload !== 'string' || payload.length < 2 || payload.length > MAX_SHARE_URL * 2 || !/^[zp][A-Za-z0-9_-]+$/.test(payload)) return null;
    let bytes = fromB64Url(payload.slice(1));
    const limit = MAX_CODE_BYTES + 512;
    if (payload[0] === 'z') {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), limit);
    } else if (bytes.length > limit) return null;
    const data = JSON.parse(dec.decode(bytes));
    if (!data || typeof data.c !== 'string' || !data.c || enc.encode(data.c).length > MAX_CODE_BYTES) return null;
    return { lang: typeof data.l === 'string' ? data.l : '', code: data.c };
  } catch {
    return null;
  }
}

/** URL compartible del idioma de interfaz actual; devuelve null si supera el tope de longitud. */
export async function buildShareUrl(code, lang, uiLang, base = location.href) {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('lang', uiLang);
  const payload = await encodeSnippet(code, lang);
  const href = `${url.toString()}&snippet=${payload}`;
  return href.length <= MAX_SHARE_URL ? href : null;
}
