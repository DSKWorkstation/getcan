import { env } from 'cloudflare:workers';
import { database } from '@/lib/commercial';

// Web Push without a payload: the push only wakes the service worker, which
// then fetches the stored message for its endpoint. That needs VAPID signing
// (ES256) but no message encryption. Nothing is sent until the VAPID keys are
// configured; generate them with `node scripts/generate-vapid-keys.mjs`.
export type PushMessage = { title: string; body: string; url: string };
type Audience = { distributorId: number; kind: 'distributor' } | { distributorId: number; kind: 'customer'; customerId: number };

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));

export const pushPublicKey = (): string | null => env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null;

// Only well-known browser push services; the endpoint comes from the client.
const pushHosts = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && pushHosts.some(host => host.test(url.hostname));
  } catch { return false; }
}

async function signingKey(): Promise<CryptoKey> {
  const publicKey = fromBase64url(env.VAPID_PUBLIC_KEY!);
  const jwk = { kty: 'EC', crv: 'P-256', x: base64url(publicKey.slice(1, 33)), y: base64url(publicKey.slice(33, 65)), d: env.VAPID_PRIVATE_KEY!, ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function vapidAuthorization(endpoint: string, key: CryptoKey, now = Date.now()): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://getcan.in' })));
  // WebCrypto returns the raw r||s signature that JWS ES256 expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Notify every device subscribed for this audience. Failures never block the caller. */
export async function notify(audience: Audience, message: PushMessage): Promise<void> {
  if (!pushPublicKey()) return;
  try {
    const db = database();
    const filter = audience.kind === 'customer' ? 'distributor_id=? AND kind=? AND customer_id=?' : 'distributor_id=? AND kind=?';
    const values = audience.kind === 'customer' ? [audience.distributorId, audience.kind, audience.customerId] : [audience.distributorId, audience.kind];
    const subscribers = await db.prepare(`UPDATE app_push_subscriptions SET last_title=?,last_body=?,last_url=? WHERE ${filter} RETURNING endpoint`)
      .bind(message.title.slice(0, 120), message.body.slice(0, 240), message.url.slice(0, 300), ...values).all<{ endpoint: string }>();
    if (!subscribers.results.length) return;
    const key = await signingKey();
    await Promise.allSettled(subscribers.results.map(async ({ endpoint }) => {
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidAuthorization(endpoint, key), TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
      if (response.status === 404 || response.status === 410) await db.prepare('DELETE FROM app_push_subscriptions WHERE endpoint=?').bind(endpoint).run();
    }));
  } catch (error) {
    console.error('Push notification failed', error);
  }
}
