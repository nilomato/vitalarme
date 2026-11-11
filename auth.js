const encoder = new TextEncoder();
const ITERATIONS = 100000;
const SESSION_TTL = 8 * 3600;

const toB64 = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64 = text => {
  const p = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export const DUMMY_HASH = `pbkdf2-sha256$${ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, iterText, saltText, hashText] = String(stored).split('$');
  if (algorithm !== 'pbkdf2-sha256') return false;
  const iterations = Number(iterText);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const got = await derive(password, fromB64(saltText), iterations);
  const want = fromB64(hashText);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function createSession(DB, accountId) {
  const token = toB64(crypto.getRandomValues(new Uint8Array(32)));
  await DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowSeconds()).run();
  await DB.prepare('INSERT INTO sessions(token_hash, account_id, created_at, expires_at) VALUES(?, ?, ?, ?)')
    .bind(await sha256Hex(token), accountId, new Date().toISOString(), nowSeconds() + SESSION_TTL)
    .run();
  return token;
}

export async function getSession(DB, request) {
  const token = readCookie(request, 'va_session');
  if (!token || token.length > 100) return null;
  const row = await DB.prepare('SELECT account_id AS accountId FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await sha256Hex(token), nowSeconds())
    .first();
  return row ? { accountId: row.accountId } : null;
}

export async function destroySession(DB, request) {
  const token = readCookie(request, 'va_session');
  if (token && token.length <= 100) {
    await DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
}

export const sessionCookie = token => `va_session=${token}; Max-Age=${SESSION_TTL}; Path=/; HttpOnly; Secure; SameSite=Strict`;
export const clearedCookie = 'va_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict';

export function sameOriginRequest(request, url) {
  if (request.headers.get('X-Requested-With') !== 'vitalarme') return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

export async function rateLimit(DB, key, limit, windowSeconds) {
  const now = nowSeconds();
  const row = await DB.prepare(
    `INSERT INTO rate_limits(key, count, reset_at) VALUES(?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END
     RETURNING count`
  ).bind(key, now + windowSeconds, now, now, now + windowSeconds).first();
  return row.count <= limit;
}
