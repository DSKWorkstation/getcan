import { beforeEach, describe, expect, it } from 'vitest';
import { POST as addCustomer } from '@/app/api/commercial/customers/route';
import { PATCH as updateOrder } from '@/app/api/commercial/orders/route';
import { DELETE as unsubscribe, GET as latest, POST as subscribe } from '@/app/api/commercial/push/route';
import { POST as order } from '@/app/api/commercial/request/[token]/route';
import { mockFetch, params, request, setup, signedIn, type TestD1, type Json } from './support/app';

let db: TestD1, cookie: string, token: string, publicKey: CryptoKey;
const distributorDevice = 'https://fcm.googleapis.com/fcm/send/distributor-device';
const customerDevice = 'https://updates.push.services.mozilla.com/wpush/v2/customer-device';
const fromBase64url = (text: string) => Uint8Array.from(Buffer.from(text, 'base64url'));

beforeEach(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  publicKey = pair.publicKey;
  const raw = Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).toString('base64url');
  db = setup({ VAPID_PUBLIC_KEY: raw, VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d });
  ({ cookie } = await signedIn(db));
  const created = await (await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'Anita', phone: '9123456780' } }))).json<Json>();
  token = new URL(created.requestLink).pathname.split('/').pop()!;
});

describe('delivery alerts', () => {
  it('alerts the distributor about a new request with a valid VAPID signature', async () => {
    expect((await subscribe(request('/api/commercial/push', { cookie, body: { endpoint: distributorDevice } }))).status).toBe(201);
    const calls = mockFetch({ 'https://fcm.googleapis.com/': () => new Response(null, { status: 201 }) });
    expect((await order(request(`/api/commercial/request/${token}`, { body: { quantity: 2 } }), params({ token }))).status).toBe(201);

    expect(calls).toHaveLength(1);
    const authorization = new Headers(calls[0].init?.headers).get('authorization')!;
    const [, jwt] = authorization.match(/^vapid t=([^,]+), k=/)!;
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ aud: 'https://fcm.googleapis.com' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromBase64url(signature), new TextEncoder().encode(`${header}.${claims}`))).toBe(true);

    const message = await (await latest(request(`/api/commercial/push?endpoint=${encodeURIComponent(distributorDevice)}`))).json<Json>();
    expect(message).toEqual({ title: 'New water request', body: 'Anita · 2 cans', url: '/commercial' });
  });

  it('tells the customer when water is on the way and forgets dead devices', async () => {
    expect((await subscribe(request('/api/commercial/push', { body: { endpoint: customerDevice, token } }))).status).toBe(201);
    mockFetch({});
    const { id } = await (await order(request(`/api/commercial/request/${token}`, { body: { quantity: 2 } }), params({ token }))).json<Json>();
    const calls = mockFetch({ 'https://updates.push.services.mozilla.com/': () => new Response(null, { status: 410 }) });
    expect((await updateOrder(request('/api/commercial/orders', { method: 'PATCH', cookie, body: { id, status: 'out_for_delivery' } }))).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM app_push_subscriptions').get()).toEqual({ n: 0 });
  });

  it('only accepts real browser push services', async () => {
    expect((await subscribe(request('/api/commercial/push', { cookie, body: { endpoint: 'https://attacker.test/collect' } }))).status).toBe(400);
    expect((await subscribe(request('/api/commercial/push', { cookie, body: { endpoint: 'http://fcm.googleapis.com/x' } }))).status).toBe(400);
  });

  it('needs a session or a valid customer link', async () => {
    expect((await subscribe(request('/api/commercial/push', { body: { endpoint: distributorDevice } }))).status).toBe(401);
    expect((await subscribe(request('/api/commercial/push', { body: { endpoint: customerDevice, token: 'b'.repeat(64) } }))).status).toBe(404);
  });

  it('removes a device on request', async () => {
    await subscribe(request('/api/commercial/push', { cookie, body: { endpoint: distributorDevice } }));
    await unsubscribe(request('/api/commercial/push', { method: 'DELETE', body: { endpoint: distributorDevice } }));
    expect((await latest(request(`/api/commercial/push?endpoint=${encodeURIComponent(distributorDevice)}`))).status).toBe(404);
  });

  it('stays silent until VAPID keys are configured', async () => {
    db = setup();
    ({ cookie } = await signedIn(db));
    expect((await subscribe(request('/api/commercial/push', { cookie, body: { endpoint: distributorDevice } }))).status).toBe(503);
    expect(await (await latest(request('/api/commercial/push'))).json<Json>()).toEqual({ publicKey: null });
  });
});
