import { env } from 'cloudflare:workers';
import { database, jsonError, phoneNumber, randomToken, sha256 } from '@/lib/commercial';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  if (!env.MSG91_AUTH_KEY) return jsonError('Phone sign-in is not configured yet.', 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const phone = phoneNumber(body?.phone);
  const code = String(body?.code ?? '');
  if (!phone || !/^[0-9]{4,9}$/.test(code)) return jsonError('Enter the verification code.', 400);
  const now = new Date().toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString();
  const attempt = await database().prepare('UPDATE app_otp_attempts SET verify_count=verify_count+1 WHERE phone=? AND sent_at>? AND verify_count<5 RETURNING phone')
    .bind(phone, fiveMinutesAgo).first();
  if (!attempt) return jsonError('Code expired or too many attempts. Request a new code.', 429);
  const url = new URL('https://control.msg91.com/api/v5/otp/verify');
  url.searchParams.set('mobile', `91${phone}`);
  url.searchParams.set('otp', code);
  const checked = await fetch(url, { headers: { authkey: env.MSG91_AUTH_KEY } });
  const result = await checked.json().catch(() => null) as { type?: string; message?: string } | null;
  if (!checked.ok || result?.type !== 'success') return jsonError('Incorrect code. Please try again.', 401);
  // Mark the challenge consumed before issuing a session. An OTP cannot be
  // replayed to create additional sessions even when MSG91 accepts it again.
  const consumed = await database().prepare('DELETE FROM app_otp_attempts WHERE phone=? AND sent_at>? RETURNING phone')
    .bind(phone, fiveMinutesAgo).first();
  if (!consumed) return jsonError('Code already used. Request a new code.', 409);
  await database().prepare('INSERT OR IGNORE INTO app_distributors (phone,name,created_at,updated_at) VALUES (?,?,?,?)')
    .bind(phone, 'My distribution', now, now).run();
  const distributor = await database().prepare('SELECT id FROM app_distributors WHERE phone=?').bind(phone).first<{ id: number }>();
  if (!distributor) return jsonError('Could not create your account.', 503);
  const token = randomToken();
  const expires = new Date(Date.now() + 180 * 86400000).toISOString();
  await database().prepare('INSERT INTO app_sessions (token_hash,distributor_id,expires_at,created_at) VALUES (?,?,?,?)')
    .bind(await sha256(token), distributor.id, expires, now).run();
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': `getcan_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`, 'Cache-Control': 'no-store' } });
}
