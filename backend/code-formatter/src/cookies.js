import { COOKIE_NAME } from './config.js';

// HttpOnly + Secure + __Host- (Path=/, sin Domain) + SameSite=Lax.
const BASE = `${COOKIE_NAME}=`;
const ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

export const sessionCookie = (token, maxAgeSeconds) => `${BASE}${token}; ${ATTRS}; Max-Age=${maxAgeSeconds}`;
export const clearSessionCookie = () => `${BASE}; ${ATTRS}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

export function readSessionToken(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE_NAME) return part.slice(i + 1).trim() || null;
  }
  return null;
}
