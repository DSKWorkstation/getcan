import { activeDistributorId, database, jsonError } from '@/lib/commercial';

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const settings = await database().prepare('SELECT name,default_price_cents FROM app_distributors WHERE id=?').bind(owner).first();
  return Response.json({ settings });
}

export async function PATCH(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name ?? '').trim().slice(0, 80);
  const price = Number(body?.defaultPriceCents);
  if (!name || !Number.isInteger(price) || price < 0 || price > 100000) return jsonError('Check the name and price per can.', 400);
  await database().prepare('UPDATE app_distributors SET name=?,default_price_cents=?,updated_at=? WHERE id=?')
    .bind(name, price, new Date().toISOString(), owner).run();
  return Response.json({ ok: true });
}
