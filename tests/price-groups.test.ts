import { beforeEach, describe, expect, it } from 'vitest';
import { GET as bootstrap } from '@/app/api/commercial/bootstrap/route';
import { PATCH as editCustomer, POST as addCustomer } from '@/app/api/commercial/customers/route';
import { POST as distributorOrder, PATCH as updateOrder } from '@/app/api/commercial/orders/route';
import { DELETE as removeGroup, PATCH as editGroup, POST as addGroup } from '@/app/api/commercial/price-groups/route';
import { POST as quickOrder } from '@/app/api/commercial/quick-order/route';
import { GET as page, POST as order } from '@/app/api/commercial/request/[token]/route';
import { params, request, setup, signedIn, type Json, type TestD1 } from './support/app';

let db: TestD1, cookie: string, office: number, house: number, officeToken: string;
const price = (id: number) => (db.sqlite.prepare('SELECT price_cents FROM app_orders WHERE id=?').get(id) as { price_cents: number }).price_cents;
const customer = async (name: string, phone: string) => {
  const res = await (await addCustomer(request('/api/commercial/customers', { cookie, body: { name, phone } }))).json<Json>();
  return { id: res.id as number, token: new URL(res.requestLink).pathname.split('/').pop()! };
};

beforeEach(async () => {
  db = setup();
  ({ cookie } = await signedIn(db));
  const created = await addGroup(request('/api/commercial/price-groups', { cookie, body: { name: 'Office', priceCents: 2000 } }));
  expect(created.status).toBe(201);
  office = (await created.json<Json>()).id;
  const o = await customer('Infosys', '9123456780');
  house = (await customer('Anita', '9123456781')).id;
  officeToken = o.token;
  expect((await editCustomer(request('/api/commercial/customers', { method: 'PATCH', cookie, body: { id: o.id, priceGroupId: office } }))).status).toBe(200);
});

describe('price groups', () => {
  it('charges group customers the group price and everyone else the default', async () => {
    const officeOrder = await (await order(request(`/api/commercial/request/${officeToken}`, { body: { quantity: 10 } }), params({ token: officeToken }))).json<Json>();
    const houseOrder = await (await distributorOrder(request('/api/commercial/orders', { cookie, body: { customerId: house, quantity: 2 } }))).json<Json>();
    expect(price(officeOrder.id)).toBe(2000);
    expect(price(houseOrder.id)).toBe(3500);
    const view = await (await page(request(`/api/commercial/request/${officeToken}`), params({ token: officeToken }))).json<Json>();
    expect(view.distributor.default_price_cents).toBe(2000);

    expect((await updateOrder(request('/api/commercial/orders', { method: 'PATCH', cookie, body: { id: officeOrder.id, status: 'delivered' } }))).status).toBe(200);
    const desk = await (await bootstrap(request('/api/commercial/bootstrap', { cookie }))).json<Json>();
    expect(desk.priceGroups).toEqual([{ id: office, name: 'Office', price_cents: 2000 }]);
    expect(desk.summary.sales_cents).toBe(20000);
  });

  it('uses the group price for quick orders', async () => {
    const res = await (await quickOrder(request('/api/commercial/quick-order', { cookie, body: { phone: '9123456780', quantity: 5 } }))).json<Json>();
    expect(price(res.id)).toBe(2000);
  });

  it('re-prices open orders when the group changes but keeps delivered ones', async () => {
    const ordered = async () => (await (await quickOrder(request('/api/commercial/quick-order', { cookie, body: { phone: '9123456780', quantity: 5 } }))).json<Json>()).id as number;
    const delivered = await ordered();
    await updateOrder(request('/api/commercial/orders', { method: 'PATCH', cookie, body: { id: delivered, status: 'delivered' } }));
    const open = await ordered();
    expect((await editGroup(request('/api/commercial/price-groups', { method: 'PATCH', cookie, body: { id: office, name: 'Office', priceCents: 1800 } }))).status).toBe(200);
    expect([price(delivered), price(open)]).toEqual([2000, 1800]);
    expect((await removeGroup(request('/api/commercial/price-groups', { method: 'DELETE', cookie, body: { id: office } }))).status).toBe(200);
    expect([price(delivered), price(open)]).toEqual([2000, 3500]);
  });

  it('keeps groups private to their distributor', async () => {
    const other = await signedIn(db, { phone: '9876500000' });
    const theirs = await (await addGroup(request('/api/commercial/price-groups', { cookie: other.cookie, body: { name: 'Shop', priceCents: 1000 } }))).json<Json>();
    expect((await editCustomer(request('/api/commercial/customers', { method: 'PATCH', cookie, body: { id: house, priceGroupId: theirs.id } }))).status).toBe(404);
    expect((await editGroup(request('/api/commercial/price-groups', { method: 'PATCH', cookie, body: { id: theirs.id, name: 'Mine', priceCents: 100 } }))).status).toBe(404);
    expect((await removeGroup(request('/api/commercial/price-groups', { method: 'DELETE', cookie, body: { id: theirs.id } }))).status).toBe(404);
  });

  it('puts a new customer in a group when they are added', async () => {
    const added = await (await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'TCS', phone: '9123456790', priceGroupId: office } }))).json<Json>();
    expect(db.sqlite.prepare('SELECT price_group_id FROM app_customers WHERE id=?').get(added.id)).toEqual({ price_group_id: office });
    const order = await (await distributorOrder(request('/api/commercial/orders', { cookie, body: { customerId: added.id, quantity: 3 } }))).json<Json>();
    expect(price(order.id)).toBe(2000);
    expect((await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'X', phone: '9123456791', priceGroupId: 99999 } }))).status).toBe(404);
  });

  it('prices a quick order for a new customer at the chosen group, and ignores it for existing customers', async () => {
    const fresh = await (await quickOrder(request('/api/commercial/quick-order', { cookie, body: { phone: '9123456792', quantity: 4, priceGroupId: office } }))).json<Json>();
    expect(fresh.newCustomer).toBe(true);
    expect(price(fresh.id)).toBe(2000);
    const existing = await (await quickOrder(request('/api/commercial/quick-order', { cookie, body: { phone: '9123456781', quantity: 2, priceGroupId: office } }))).json<Json>();
    expect(price(existing.id)).toBe(3500);
  });
});
