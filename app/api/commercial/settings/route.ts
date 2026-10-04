import { activeDistributorId, database, jsonError } from '@/lib/commercial';

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const settings = await database().prepare('SELECT name,default_price_cents,upi_id FROM app_distributors WHERE id=?').bind(owner).first();
  return Response.json({ settings });
}

export async function PATCH(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name ?? '').trim().slice(0, 80);
  const price = Number(body?.defaultPriceCents);
  // A UPI ID (VPA) looks like name@bank; empty turns UPI payment links off.
  const upi = String(body?.upiId ?? '').trim().slice(0, 100);
  if (!name || !Number.isInteger(price) || price < 0 || price > 100000) return jsonError('Check the name and price per can.', 400);
  if (upi && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(upi)) return jsonError('Check the UPI ID, for example name@okbank.', 400);
  // The first save (the welcome steps, or Settings) completes onboarding.
  const now = new Date().toISOString();
  await database().prepare('UPDATE app_distributors SET name=?,default_price_cents=?,upi_id=?,onboarded_at=COALESCE(onboarded_at,?),updated_at=? WHERE id=?')
    .bind(name, price, upi, now, now, owner).run();
  return Response.json({ ok: true });
}
