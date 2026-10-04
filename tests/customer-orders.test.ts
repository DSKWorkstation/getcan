import { beforeEach, describe, expect, it } from 'vitest';
import { POST as addCustomer } from '@/app/api/commercial/customers/route';
import { PATCH as updateOrder } from '@/app/api/commercial/orders/route';
import { POST as quickOrder } from '@/app/api/commercial/quick-order/route';
import { DELETE as cancel, GET as page, PATCH as change, POST as order } from '@/app/api/commercial/request/[token]/route';
import { GET as statement } from '@/app/api/commercial/statement/route';
import { PATCH as settings } from '@/app/api/commercial/settings/route';
import { params, request, setup, signedIn, type TestD1, type Json } from './support/app';

let db: TestD1, cookie: string, token: string;
const linkPath = () => `/api/commercial/request/${token}`;
const ctx = () => params({ token });

beforeEach(async () => {
  db = setup();
  ({ cookie } = await signedIn(db));
  const created = await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'Anita', phone: '9123456780', area: 'Anna Nagar', usualQuantity: 2 } }));
  expect(created.status).toBe(201);
  token = new URL((await created.json<Json>()).requestLink).pathname.split('/').pop()!;
});

describe('customer order page', () => {
  it('places one order at a time at the distributor price', async () => {
    const first = await order(request(linkPath(), { body: { quantity: 3 } }), ctx());
    expect(first.status).toBe(201);
    expect((await order(request(linkPath(), { body: { quantity: 1 } }), ctx())).status).toBe(409);
    const data = await (await page(request(linkPath()), ctx())).json<Json>();
    expect(data.orders[0]).toMatchObject({ quantity: 3, price_cents: 3500, status: 'requested' });
    expect(data.customer.name).toBe('Anita');
  });

  it('lets the customer change or cancel until the order is dispatched', async () => {
    const { id } = await (await order(request(linkPath(), { body: { quantity: 2 } }), ctx())).json<Json>();
    expect((await change(request(linkPath(), { method: 'PATCH', body: { id, quantity: 4 } }), ctx())).status).toBe(200);
    expect(db.sqlite.prepare('SELECT quantity FROM app_orders WHERE id=?').get(id)).toEqual({ quantity: 4 });
    expect((await cancel(request(linkPath(), { method: 'DELETE', body: { id } }), ctx())).status).toBe(200);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM app_orders').get()).toEqual({ n: 0 });

    const again = await (await order(request(linkPath(), { body: { quantity: 2 } }), ctx())).json<Json>();
    expect((await updateOrder(request('/api/commercial/orders', { method: 'PATCH', cookie, body: { id: again.id, status: 'out_for_delivery' } }))).status).toBe(200);
    expect((await change(request(linkPath(), { method: 'PATCH', body: { id: again.id, quantity: 5 } }), ctx())).status).toBe(409);
    expect((await cancel(request(linkPath(), { method: 'DELETE', body: { id: again.id } }), ctx())).status).toBe(409);
  });

  it('cannot touch another customer’s order', async () => {
    const other = await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'Bala', phone: '9123456781' } }));
    const otherToken = new URL((await other.json<Json>()).requestLink).pathname.split('/').pop()!;
    const { id } = await (await order(request(`/api/commercial/request/${otherToken}`, { body: { quantity: 2 } }), params({ token: otherToken }))).json<Json>();
    expect((await cancel(request(linkPath(), { method: 'DELETE', body: { id } }), ctx())).status).toBe(409);
  });

  it('shows the balance, empty cans and UPI details after delivery', async () => {
    expect((await settings(request('/api/commercial/settings', { method: 'PATCH', cookie, body: { name: 'Blue Water', defaultPriceCents: 4000, upiId: 'bluewater@okaxis' } }))).status).toBe(200);
    const { id } = await (await order(request(linkPath(), { body: { quantity: 3 } }), ctx())).json<Json>();
    const delivered = await updateOrder(request('/api/commercial/orders', { method: 'PATCH', cookie, body: { id, status: 'delivered', returnedCans: 1, paidCents: 5000, method: 'upi' } }));
    expect(delivered.status).toBe(200);
    const data = await (await page(request(linkPath()), ctx())).json<Json>();
    expect(data.account).toEqual({ balanceCents: 3 * 4000 - 5000, cansOut: 2 });
    expect(data.distributor.upi_id).toBe('bluewater@okaxis');

    const month = new Date(Date.now() + 19800000).toISOString().slice(0, 7);
    const customerId = (db.sqlite.prepare('SELECT id FROM app_customers').get() as { id: number }).id;
    const report = await (await statement(request(`/api/commercial/statement?customerId=${customerId}&month=${month}`, { cookie }))).json<Json>();
    expect(report).toMatchObject({ openingBalanceCents: 0, chargedCents: 12000, paidCents: 5000, closingBalanceCents: 7000, cansDelivered: 3, cansReturned: 1, closingCans: 2 });
    expect(report.payments[0].method).toBe('upi');
  });

  it('rejects an invalid UPI ID', async () => {
    expect((await settings(request('/api/commercial/settings', { method: 'PATCH', cookie, body: { name: 'Blue Water', defaultPriceCents: 4000, upiId: 'not a vpa' } }))).status).toBe(400);
  });

  it('quick order reuses the customer’s existing link', async () => {
    const response = await quickOrder(request('/api/commercial/quick-order', { cookie, body: { phone: '9123456780', quantity: 2 } }));
    expect(response.status).toBe(201);
    expect((await response.json<Json>()).requestLink).toBe(`https://getcan.test/c/${token}`);
  });

  it('refuses the statement for another distributor’s customer', async () => {
    const other = await signedIn(db, { phone: '9000000001' });
    const customerId = (db.sqlite.prepare('SELECT id FROM app_customers').get() as { id: number }).id;
    expect((await statement(request(`/api/commercial/statement?customerId=${customerId}&month=2026-10`, { cookie: other.cookie }))).status).toBe(404);
  });
});

describe('desk pulse', () => {
  it('changes when a customer orders, changes or cancels', async () => {
    const { GET: pulse } = await import('@/app/api/commercial/pulse/route');
    const read = async () => (await (await pulse(request('/api/commercial/pulse', { cookie }))).json<Json>()).signature as string;
    const empty = await read();
    const { id } = await (await order(request(linkPath(), { body: { quantity: 2 } }), ctx())).json<Json>();
    const placed = await read();
    expect(placed).not.toBe(empty);
    await new Promise(resolve => setTimeout(resolve, 5));
    await change(request(linkPath(), { method: 'PATCH', body: { id, quantity: 3 } }), ctx());
    const changed = await read();
    expect(changed).not.toBe(placed);
    await cancel(request(linkPath(), { method: 'DELETE', body: { id } }), ctx());
    expect(await read()).not.toBe(changed);
  });
});
