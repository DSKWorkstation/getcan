import { beforeEach, describe, expect, it } from 'vitest';
import { GET as bootstrap } from '@/app/api/commercial/bootstrap/route';
import { PATCH as settings } from '@/app/api/commercial/settings/route';
import { request, setup, signedIn, type TestD1, type Json } from './support/app';

let db: TestD1, cookie: string;

beforeEach(async () => {
  db = setup();
  ({ cookie } = await signedIn(db));
});

describe('first sign-in setup', () => {
  it('asks a new distributor for setup until the first settings save', async () => {
    const first = await (await bootstrap(request('/api/commercial/bootstrap', { cookie }))).json<Json>();
    expect(first.settings.onboarded).toBe(false);
    const saved = await settings(request('/api/commercial/settings', { method: 'PATCH', cookie, body: { name: 'Blue Water', defaultPriceCents: 4000, upiId: '' } }));
    expect(saved.status).toBe(200);
    const after = await (await bootstrap(request('/api/commercial/bootstrap', { cookie }))).json<Json>();
    expect(after.settings).toMatchObject({ name: 'Blue Water', default_price_cents: 4000, onboarded: true });
  });

  it('keeps the first onboarding time when settings change later', async () => {
    const save = (name: string) => settings(request('/api/commercial/settings', { method: 'PATCH', cookie, body: { name, defaultPriceCents: 4000, upiId: '' } }));
    await save('Blue Water');
    const { onboarded_at: first } = db.sqlite.prepare('SELECT onboarded_at FROM app_distributors').get() as { onboarded_at: string };
    await new Promise(resolve => setTimeout(resolve, 5));
    await save('Blue Water Supply');
    expect(db.sqlite.prepare('SELECT onboarded_at FROM app_distributors').get()).toEqual({ onboarded_at: first });
  });
});
