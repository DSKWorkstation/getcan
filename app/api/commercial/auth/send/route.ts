import { env } from 'cloudflare:workers';
import { database, jsonError, phoneNumber } from '@/lib/commercial';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  if (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID || !env.TURNSTILE_SECRET) return jsonError('Phone sign-in is not configured yet.', 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const phone = phoneNumber(body?.phone);
  const challenge = String(body?.turnstileToken ?? '');
  if (!phone || !challenge) return jsonError('Enter a valid Indian mobile number and complete verification.', 400);
  const turnstile = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: challenge }),
  });
  const check = await turnstile.json() as { success?: boolean; hostname?: string };
  if (!check.success || check.hostname !== new URL(request.url).hostname) return jsonError('Verification failed. Please try again.', 403);
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const windowEnd = new Date(now + 86400000).toISOString();
  const cooldown = new Date(now - 60000).toISOString();
  const reservation = await database().prepare(`INSERT INTO app_otp_attempts (phone,sent_at,send_count,verify_count,expires_at)
    VALUES (?,?,1,0,?) ON CONFLICT(phone) DO UPDATE SET
    sent_at=excluded.sent_at,send_count=CASE WHEN expires_at<=? THEN 1 ELSE send_count+1 END,
    verify_count=0,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    WHERE sent_at<=? AND (expires_at<=? OR send_count<5) RETURNING phone`)
    .bind(phone, stamp, windowEnd, stamp, stamp, cooldown, stamp).first();
  if (!reservation) return jsonError('Please wait before requesting another code.', 429);
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID);
  url.searchParams.set('mobile', `91${phone}`);
  const sent = await fetch(url, { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json' }, body: '{}' });
  const result = await sent.json().catch(() => null) as { type?: string } | null;
  if (!sent.ok || result?.type !== 'success') return jsonError('Could not send the code. Please try again later.', 502);
  return Response.json({ ok: true });
}
