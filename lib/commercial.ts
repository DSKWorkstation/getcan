import { env } from 'cloudflare:workers';

export const database = (): D1Database => {
  if (!env.DB) throw new Error('Commercial database is unavailable');
  return env.DB;
};

export const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status });

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sessionCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').map(part => part.trim()).find(part => part.startsWith('getcan_session='))?.slice('getcan_session='.length) ?? null;
}

export async function distributorId(request: Request): Promise<number | null> {
  const token = sessionCookie(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await database().prepare('SELECT distributor_id FROM app_sessions WHERE token_hash=? AND expires_at>?')
    .bind(await sha256(token), new Date().toISOString()).first<{ distributor_id: number }>();
  return row?.distributor_id ?? null;
}

export async function activeDistributorId(request: Request): Promise<number | null> {
  const owner = await distributorId(request);
  if (!owner) return null;
  return await distributorHasAccess(owner) ? owner : null;
}

export async function distributorHasAccess(owner: number): Promise<boolean> {
  const distributor = await database().prepare('SELECT created_at FROM app_distributors WHERE id=?').bind(owner).first<{created_at:string}>();
  if(distributor && Date.parse(distributor.created_at)+60*86400000>Date.now())return true;
  const subscription = await database().prepare("SELECT status,current_end_at FROM app_subscriptions WHERE distributor_id=? AND status='active'")
    .bind(owner).first<{ status: string; current_end_at: string | null }>();
  return subscription && (!subscription.current_end_at || subscription.current_end_at > new Date().toISOString()) ? true : false;
}

export const phoneNumber = (value: unknown): string | null => {
  const digits = String(value ?? '').replace(/\D/g, '');
  const domestic = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9][0-9]{9}$/.test(domestic) ? domestic : null;
};

export const positiveInt = (value: unknown, max: number): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : null;
};
