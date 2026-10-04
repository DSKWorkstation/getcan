import { beforeEach, describe, expect, it } from 'vitest';
import { POST as webhook } from '@/app/api/commercial/razorpay-webhook/route';
import { GET as bootstrap } from '@/app/api/commercial/bootstrap/route';
import { POST as subscribe } from '@/app/api/commercial/billing/route';
import { json, mockFetch, request, setup, signedIn, type TestD1, type Json } from './support/app';

let db: TestD1, cookie: string, owner: number;
const expired = new Date(Date.now() - 90 * 86400000).toISOString();

async function signed(body: string, secret = 'webhook-secret') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deliver(event: object, { eventId = 'evt_1', secret }: { eventId?: string; secret?: string } = {}) {
  const body = JSON.stringify(event);
  return webhook(request('/api/commercial/razorpay-webhook', { body, origin: null, headers: { 'x-razorpay-signature': await signed(body, secret), 'x-razorpay-event-id': eventId } }));
}
const activated = { event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_ABC123' } } } };

beforeEach(async () => {
  db = setup();
  ({ cookie, id: owner } = await signedIn(db, { createdAt: expired }));
  db.sqlite.prepare("INSERT INTO app_subscriptions (distributor_id,razorpay_id,status,updated_at) VALUES (?,?,?,?)").run(owner, 'sub_ABC123', 'created', expired);
});

describe('Razorpay subscription webhook', () => {
  it('locks the desk after the free period until the plan is paid', async () => {
    const desk = await (await bootstrap(request('/api/commercial/bootstrap', { cookie }))).json<Json>();
    expect(desk.billing.status).toBe('created');
    expect(desk.customers).toBeUndefined();
  });

  it('activates the plan from the current Razorpay state', async () => {
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    mockFetch({ 'https://api.razorpay.com/v1/subscriptions/sub_ABC123': () => json({ id: 'sub_ABC123', status: 'active', current_end: end }) });
    expect((await deliver(activated)).status).toBe(200);
    expect(db.sqlite.prepare('SELECT status,current_end_at FROM app_subscriptions').get()).toEqual({ status: 'active', current_end_at: new Date(end * 1000).toISOString() });
    const desk = await (await bootstrap(request('/api/commercial/bootstrap', { cookie }))).json<Json>();
    expect(desk.billing.status).toBe('active');
    expect(desk.customers).toEqual([]);
  });

  it('trusts Razorpay over the event when they disagree', async () => {
    mockFetch({ 'https://api.razorpay.com/v1/subscriptions/': () => json({ id: 'sub_ABC123', status: 'halted', current_end: null }) });
    await deliver(activated);
    expect(db.sqlite.prepare('SELECT status FROM app_subscriptions').get()).toEqual({ status: 'halted' });
  });

  it('rejects a bad signature', async () => {
    mockFetch({});
    expect((await deliver(activated, { secret: 'wrong' })).status).toBe(401);
    expect(db.sqlite.prepare('SELECT status FROM app_subscriptions').get()).toEqual({ status: 'created' });
  });

  it('ignores subscriptions it does not know', async () => {
    mockFetch({});
    const response = await deliver({ event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_OTHER' } } } });
    expect(await response.json<Json>()).toEqual({ ignored: true });
  });

  it('only accepts a ₹50 monthly plan when subscribing', async () => {
    db.sqlite.prepare('DELETE FROM app_subscriptions').run();
    mockFetch({ 'https://api.razorpay.com/v1/plans/plan_1': () => json({ period: 'monthly', interval: 1, item: { amount: 9900, currency: 'INR' } }) });
    expect((await subscribe(request('/api/commercial/billing', { cookie, body: {} }))).status).toBe(503);
  });

  it('creates one subscription and returns its checkout link', async () => {
    db.sqlite.prepare('DELETE FROM app_subscriptions').run();
    mockFetch({
      'https://api.razorpay.com/v1/plans/plan_1': () => json({ period: 'monthly', interval: 1, item: { amount: 5000, currency: 'INR' } }),
      'https://api.razorpay.com/v1/subscriptions': () => json({ id: 'sub_NEW1', short_url: 'https://rzp.io/i/abc' }),
    });
    const first = await (await subscribe(request('/api/commercial/billing', { cookie, body: {} }))).json<Json>();
    expect(first).toEqual({ status: 'created', checkoutUrl: 'https://rzp.io/i/abc' });
    const second = await (await subscribe(request('/api/commercial/billing', { cookie, body: {} }))).json<Json>();
    expect(second.checkoutUrl).toBe('https://rzp.io/i/abc');
  });
});
