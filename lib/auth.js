/**
 * lib/auth.js — JWT Auth Helper
 * Dipakai di semua API route untuk verifikasi token
 */
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'indotrader-secret-2024-change-this';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function createToken(payload) {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const sig     = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    if (!token) return null;
    const [header, body, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64').toString());
    // Token expired check (7 hari)
    if (payload.iat && (Date.now() / 1000 - payload.iat) > 60 * 60 * 24 * 7) return null;
    return payload;
  } catch { return null; }
}

export function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'indotrader-salt-2024').digest('hex');
}
