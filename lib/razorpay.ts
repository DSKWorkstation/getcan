import { env } from 'cloudflare:workers';
import { database } from '@/lib/commercial';

// Secrets set by piping from Windows PowerShell can carry a byte-order mark or a newline.
const clean = (value?: string) => (value ?? '').replace(/[\uFEFF\u200B]/g, '').trim();
export const razorpayPlanId = () => clean(env.RAZORPAY_PLAN_ID);
export const razorpayKeyId = () => clean(env.RAZORPAY_KEY_ID);

export function razorpayReady(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_PLAN_ID && env.RAZORPAY_WEBHOOK_SECRET);
}

export async function razorpayRequest(path: string, init?: RequestInit): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error('Razorpay is not configured');
  return fetch(`https://api.razorpay.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${razorpayKeyId()}:${clean(env.RAZORPAY_KEY_SECRET)}`)}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function validWebhook(body: string, signature: string): Promise<boolean> {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RAZORPAY_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body));
}

// Asks Razorpay for a subscription's current state and stores it, so a payment unlocks
// the desk even when the webhook is late or missing. At most once every 20 seconds.
export async function syncSubscription(distributorId: number): Promise<{ status: string; current_end_at: string | null } | null> {
  const db = database();
  const row = await db.prepare('SELECT razorpay_id,updated_at FROM app_subscriptions WHERE distributor_id=?').bind(distributorId).first<{ razorpay_id: string | null; updated_at: string }>();
  if (!row?.razorpay_id || !razorpayReady() || Date.now() - Date.parse(row.updated_at) < 20000) return null;
  const response = await razorpayRequest(`subscriptions/${encodeURIComponent(row.razorpay_id)}`).catch(() => null);
  const current = response?.ok ? await response.json().catch(() => null) as { id?: string; status?: string; current_end?: number | null } | null : null;
  const now = new Date().toISOString();
  if (current?.id !== row.razorpay_id || !current.status) {
    await db.prepare('UPDATE app_subscriptions SET updated_at=? WHERE distributor_id=?').bind(now, distributorId).run();
    return null;
  }
  const endAt = current.current_end ? new Date(current.current_end * 1000).toISOString() : null;
  await db.prepare('UPDATE app_subscriptions SET status=?,current_end_at=?,updated_at=? WHERE distributor_id=?').bind(current.status, endAt, now, distributorId).run();
  return { status: current.status, current_end_at: endAt };
}
