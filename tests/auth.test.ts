import { beforeEach, describe, expect, it } from 'vitest';
import { POST as send } from '@/app/api/commercial/auth/send/route';
import { POST as verify } from '@/app/api/commercial/auth/verify/route';
import { POST as logout } from '@/app/api/commercial/auth/logout/route';
import { GET as bootstrap } from '@/app/api/commercial/bootstrap/route';
import { json, mockFetch, request, setup, type TestD1, type Json } from './support/app';

let db: TestD1;
const phone = '9876543210';
const providers = (otpAccepted = true) => mockFetch({
  'https://challenges.cloudflare.com/': () => json({ success: true, hostname: 'getcan.test' }),
  'https://control.msg91.com/api/v5/otp/verify': () => json({ type: otpAccepted ? 'success' : 'error' }),
  'https://control.msg91.com/api/v5/otp': () => json({ type: 'success' }),
});

beforeEach(() => { db = setup(); });

describe('phone sign-in', () => {
  it('sends a code, verifies it and opens a session', async () => {
    const calls = providers();
    expect((await send(request('/api/commercial/auth/send', { body: { phone: `+91 ${phone}`, turnstileToken: 'ok' } }))).status).toBe(200);
    expect(calls.some(c => c.url.includes('mobile=919876543210'))).toBe(true);

    const response = await verify(request('/api/commercial/auth/verify', { body: { phone, code: '1234' } }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toMatch(/^getcan_session=[a-f0-9]{64}$/);
    expect(db.sqlite.prepare('SELECT phone FROM app_distributors').all()).toEqual([{ phone }]);

    const desk = await bootstrap(request('/api/commercial/bootstrap', { cookie }));
    expect(desk.status).toBe(200);
    expect((await desk.json<Json>()).billing.status).toBe('active');
  });

  it('rejects a replayed code', async () => {
    providers();
    await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' } }));
    expect((await verify(request('/api/commercial/auth/verify', { body: { phone, code: '1234' } }))).status).toBe(200);
    expect((await verify(request('/api/commercial/auth/verify', { body: { phone, code: '1234' } }))).status).toBe(429);
  });

  it('rejects a wrong code without creating an account', async () => {
    providers(false);
    await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' } }));
    expect((await verify(request('/api/commercial/auth/verify', { body: { phone, code: '0000' } }))).status).toBe(401);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM app_distributors').get()).toEqual({ n: 0 });
  });

  it('limits how often a code can be sent', async () => {
    providers();
    expect((await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' } }))).status).toBe(200);
    expect((await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' } }))).status).toBe(429);
  });

  it('refuses cross-site requests and invalid numbers', async () => {
    providers();
    expect((await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' }, origin: 'https://evil.test' }))).status).toBe(403);
    expect((await send(request('/api/commercial/auth/send', { body: { phone: '12345', turnstileToken: 'ok' } }))).status).toBe(400);
  });

  it('ends the session on sign out', async () => {
    providers();
    await send(request('/api/commercial/auth/send', { body: { phone, turnstileToken: 'ok' } }));
    const cookie = (await verify(request('/api/commercial/auth/verify', { body: { phone, code: '1234' } }))).headers.get('set-cookie')!.split(';')[0];
    await logout(request('/api/commercial/auth/logout', { body: {}, cookie }));
    expect((await bootstrap(request('/api/commercial/bootstrap', { cookie }))).status).toBe(401);
  });
});
