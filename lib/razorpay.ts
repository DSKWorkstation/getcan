import { env } from 'cloudflare:workers';

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
