export const COOKIE_NAME = '__Host-cf_session'; // el prefijo __Host- exige Secure, Path=/ y sin Domain
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const REVOKE_CHANNEL = 'cf_session_revoked';
export const SSE_HEARTBEAT_MS = 25_000;
export const SSE_RECHECK_MS = 20_000; // red de seguridad si se pierde una notificación LISTEN/NOTIFY
