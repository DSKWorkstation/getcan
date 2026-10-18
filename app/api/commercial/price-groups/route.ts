import { activeDistributorId, database, jsonError, positiveInt, repriceOpenOrders } from '@/lib/commercial';

// Price groups let a distributor charge some customers a different rate, such
// as offices that buy more cans. Customers outside a group pay the default price.
async function owned(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to manage prices.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return { owner, body };
}

function details(body: Record<string, unknown> | null) {
  const name = String(body?.name ?? '').trim().slice(0, 40);
  const price = Number(body?.priceCents);
  return name && Number.isInteger(price) && price >= 100 && price <= 100000 ? { name, price } : null;
}

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to manage prices.', 401);
  const rows = await database().prepare('SELECT id,name,price_cents FROM app_price_groups WHERE distributor_id=? ORDER BY price_cents DESC,id').bind(owner).all();
  return Response.json({ priceGroups: rows.results });
}

export async function POST(request: Request) {
  const auth = await owned(request);
  if (auth instanceof Response) return auth;
  const group = details(auth.body);
  if (!group) return jsonError('Enter a group name and a price between ₹1 and ₹1000.', 400);
  const count = await database().prepare('SELECT COUNT(*) AS n FROM app_price_groups WHERE distributor_id=?').bind(auth.owner).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) return jsonError('You can have up to 20 price groups.', 409);
  const row = await database().prepare('INSERT INTO app_price_groups (distributor_id,name,price_cents,created_at) VALUES (?,?,?,?) RETURNING id')
    .bind(auth.owner, group.name, group.price, new Date().toISOString()).first<{ id: number }>();
  return Response.json({ id: row?.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await owned(request);
  if (auth instanceof Response) return auth;
  const id = positiveInt(auth.body?.id, 2147483647), group = details(auth.body);
  if (!id || !group) return jsonError('Enter a group name and a price between ₹1 and ₹1000.', 400);
  const db = database();
  const [result] = await db.batch([
    db.prepare('UPDATE app_price_groups SET name=?,price_cents=? WHERE id=? AND distributor_id=?').bind(group.name, group.price, id, auth.owner),
    repriceOpenOrders(auth.owner),
  ]);
  if (!result.meta.changes) return jsonError('Price group not found.', 404);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await owned(request);
  if (auth instanceof Response) return auth;
  const id = positiveInt(auth.body?.id, 2147483647);
  if (!id) return jsonError('Choose a price group.', 400);
  // Customers in the group go back to the usual price.
  const db = database();
  const [, result] = await db.batch([
    db.prepare('UPDATE app_customers SET price_group_id=NULL WHERE price_group_id=? AND distributor_id=?').bind(id, auth.owner),
    db.prepare('DELETE FROM app_price_groups WHERE id=? AND distributor_id=?').bind(id, auth.owner),
    repriceOpenOrders(auth.owner),
  ]);
  if (!result.meta.changes) return jsonError('Price group not found.', 404);
  return Response.json({ ok: true });
}
