import { vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createD1, type TestD1 } from './d1';

export type { TestD1 };
// Response bodies in tests are checked by assertions, not by the type system.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export const ORIGIN = 'https://getcan.test';
export type Route = (request: Request, context?: never) => Promise<Response>;

/** A fresh database and default secrets for every test. */
export function setup(overrides: Partial<Cloudflare.Env> = {}): TestD1 {
  const db = createD1();
  for (const key of Object.keys(env)) delete (env as Record<string, unknown>)[key];
  Object.assign(env, {
    DB: db as unknown as D1Database,
    MSG91_AUTH_KEY: 'msg91-key', MSG91_OTP_TEMPLATE_ID: 'template', TURNSTILE_SECRET: 'turnstile-secret',
    RAZORPAY_KEY_ID: 'rzp_key', RAZORPAY_KEY_SECRET: 'rzp_secret', RAZORPAY_PLAN_ID: 'plan_1', RAZORPAY_WEBHOOK_SECRET: 'webhook-secret',
    LINK_SECRET: 'link-secret',
  }, overrides);
  vi.unstubAllGlobals();
  return db;
}

export function request(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; origin?: string | null } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), headers, body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body) });
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) }) as never;

/** Route outbound fetches by URL prefix; unmatched calls fail the test. */
export function mockFetch(routes: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url: url.href, init });
    const match = Object.keys(routes).find(prefix => url.href.startsWith(prefix));
    if (!match) throw new Error(`Unexpected fetch ${url.href}`);
    return routes[match](url, init);
  }));
  return calls;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Insert a distributor with a live session and return its cookie. */
export async function signedIn(db: TestD1, { phone = '9876543210', createdAt = new Date().toISOString() } = {}) {
  const { randomToken, sha256 } = await import('@/lib/commercial');
  const row = db.sqlite.prepare("INSERT INTO app_distributors (phone,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id").get(phone, 'Blue Water', createdAt, createdAt) as { id: number };
  const token = randomToken();
  db.sqlite.prepare('INSERT INTO app_sessions (token_hash,distributor_id,expires_at,created_at) VALUES (?,?,?,?)').run(await sha256(token), row.id, new Date(Date.now() + 86400000).toISOString(), createdAt);
  return { id: row.id, cookie: `getcan_session=${token}` };
}
