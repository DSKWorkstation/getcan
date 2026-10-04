import { beforeEach, describe, expect, it } from 'vitest';
import { POST as addCustomer } from '@/app/api/commercial/customers/route';
import { POST as share } from '@/app/api/commercial/customer-link/route';
import { GET as bootstrap } from '@/app/api/commercial/bootstrap/route';
import { GET as page } from '@/app/api/commercial/request/[token]/route';
import { sha256 } from '@/lib/commercial';
import { params, request, setup, signedIn, type TestD1, type Json } from './support/app';

let db: TestD1, cookie: string, owner: number;
const tokenOf = (link: string) => new URL(link).pathname.split('/').pop()!;
const open = (token: string) => page(request(`/api/commercial/request/${token}`), params({ token }));

beforeEach(async () => {
  db = setup();
  ({ cookie, id: owner } = await signedIn(db));
});

async function customer() {
  const created = await addCustomer(request('/api/commercial/customers', { cookie, body: { name: 'Anita', phone: '9123456780' } }));
  const body = await created.json<Json>();
  return { id: body.id as number, link: body.requestLink as string };
}

describe('customer links', () => {
  it('stores only a hash and a sealed copy of the link', async () => {
    const { link } = await customer();
    const row = db.sqlite.prepare('SELECT token,token_cipher,token_hash FROM app_customer_links').get() as { token: string; token_cipher: string; token_hash: string };
    expect(row.token).toBe('');
    expect(row.token_cipher).not.toContain(tokenOf(link));
    expect(row.token_hash).toBe(await sha256(tokenOf(link)));
  });

  it('shares the same link again', async () => {
    const { id, link } = await customer();
    const again = await (await share(request('/api/commercial/customer-link', { cookie, body: { id } }))).json<Json>();
    expect(again.requestLink).toBe(link);
  });

  it('a new link turns the old one off', async () => {
    const { id, link } = await customer();
    const reset = await (await share(request('/api/commercial/customer-link', { cookie, body: { id, reset: true } }))).json<Json>();
    expect(reset.requestLink).not.toBe(link);
    expect((await open(tokenOf(link))).status).toBe(404);
    expect((await open(tokenOf(reset.requestLink))).status).toBe(200);
    const again = await (await share(request('/api/commercial/customer-link', { cookie, body: { id } }))).json<Json>();
    expect(again.requestLink).toBe(reset.requestLink);
  });

  it('another distributor cannot share or reset the link', async () => {
    const { id } = await customer();
    const other = await signedIn(db, { phone: '9000000001' });
    expect((await share(request('/api/commercial/customer-link', { cookie: other.cookie, body: { id, reset: true } }))).status).toBe(404);
  });

  it('seals links saved before the secret was set', async () => {
    const legacy = 'a'.repeat(64);
    const id = (db.sqlite.prepare("INSERT INTO app_customers (distributor_id,name,phone,request_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?) RETURNING id").get(owner, 'Old', '9123456789', 'x'.repeat(64), '2026-01-01', '2026-01-01') as { id: number }).id;
    db.sqlite.prepare('INSERT INTO app_customer_links (customer_id,distributor_id,token,token_hash) VALUES (?,?,?,?)').run(id, owner, legacy, await sha256(legacy));
    expect((await bootstrap(request('/api/commercial/bootstrap', { cookie }))).status).toBe(200);
    expect(db.sqlite.prepare('SELECT token FROM app_customer_links WHERE customer_id=?').get(id)).toEqual({ token: '' });
    expect((await open(legacy)).status).toBe(200);
    const again = await (await share(request('/api/commercial/customer-link', { cookie, body: { id } }))).json<Json>();
    expect(tokenOf(again.requestLink)).toBe(legacy);
  });

  it('still works without LINK_SECRET', async () => {
    db = setup({ LINK_SECRET: undefined });
    ({ cookie } = await signedIn(db));
    const { id, link } = await customer();
    const again = await (await share(request('/api/commercial/customer-link', { cookie, body: { id } }))).json<Json>();
    expect(again.requestLink).toBe(link);
  });

  it('rejects malformed tokens', async () => {
    expect((await open('../etc/passwd')).status).toBe(404);
  });
});
