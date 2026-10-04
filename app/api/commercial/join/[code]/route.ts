import { env } from 'cloudflare:workers';
import { distributorHasAccess, database, jsonError, phoneNumber, randomToken, sha256 } from '@/lib/commercial';

export async function POST(request: Request, context: {params:Promise<{code:string}>}) {
  const {code:invite}=await context.params;
  const supplier=await database().prepare('SELECT id FROM app_distributors WHERE invite_code=?').bind(invite).first<{id:number}>();
  if(!supplier||!await distributorHasAccess(supplier.id))return jsonError('This supplier is unavailable.',404);
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
  const token=randomToken(),hash=await sha256(token);
  const name=String(body?.name??'').trim().slice(0,80)||`Customer ${phone.slice(-4)}`,area=String(body?.area??'').trim().slice(0,80),address=String(body?.address??'').trim().slice(0,240);
  await database().prepare('INSERT OR IGNORE INTO app_customers(distributor_id,name,phone,area,address,usual_quantity,frequency_days,request_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,2,7,?,?,?)').bind(supplier.id,name,phone,area,address,hash,now,now).run();
  const customer=await database().prepare('SELECT id FROM app_customers WHERE distributor_id=? AND phone=?').bind(supplier.id,phone).first<{id:number}>();
  await database().prepare('INSERT OR IGNORE INTO app_customer_links(customer_id,distributor_id,token,token_hash) VALUES (?,?,?,?)').bind(customer!.id,supplier.id,token,hash).run();
  const link=await database().prepare('SELECT token FROM app_customer_links WHERE customer_id=? AND distributor_id=?').bind(customer!.id,supplier.id).first<{token:string}>();
  return Response.json({requestPath:`/c/${link!.token}`},{headers:{'Cache-Control':'no-store'}});
}
