import { database, jsonError, sessionCookie, sha256 } from '@/lib/commercial';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const token = sessionCookie(request);
  if (token) await database().prepare('DELETE FROM app_sessions WHERE token_hash=?').bind(await sha256(token)).run();
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': 'getcan_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
}
