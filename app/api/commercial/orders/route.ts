import { activeDistributorId, database, jsonError, positiveInt } from '@/lib/commercial';

const stages = ['requested', 'accepted', 'out_for_delivery', 'delivered'] as const;

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to view orders.', 401);
  const rows = await database().prepare('SELECT o.*,c.name AS customer,c.phone,c.address,c.area FROM app_orders o JOIN app_customers c ON c.id=o.customer_id AND c.distributor_id=o.distributor_id WHERE o.distributor_id=? ORDER BY o.id DESC LIMIT 500').bind(owner).all();
  return Response.json({ orders: rows.results });
}

export async function POST(request: Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to place an order.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerId = positiveInt(body?.customerId, 2147483647);
  const quantity = positiveInt(body?.quantity, 50);
  if (!customerId || !quantity) return jsonError('Choose a customer and 1–50 cans.', 400);
  const customer = await database().prepare('SELECT id FROM app_customers WHERE id=? AND distributor_id=?').bind(customerId, owner).first();
  if (!customer) return jsonError('Customer not found.', 404);
  const distributor = await database().prepare('SELECT default_price_cents FROM app_distributors WHERE id=?').bind(owner).first<{ default_price_cents: number }>();
  const now = new Date().toISOString();
  const row = await database().prepare("INSERT INTO app_orders (distributor_id,customer_id,quantity,price_cents,status,source,created_at,updated_at) VALUES (?,?,?,?,'requested','distributor',?,?) RETURNING id")
    .bind(owner, customerId, quantity, distributor?.default_price_cents ?? 3500, now, now).first<{ id: number }>();
  return Response.json({ id: row?.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to update an order.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = positiveInt(body?.id, 2147483647);
  const status = String(body?.status ?? '');
  if (!id || !stages.includes(status as typeof stages[number])) return jsonError('Invalid order update.', 400);
  const current = await database().prepare('SELECT status,customer_id,quantity FROM app_orders WHERE id=? AND distributor_id=?')
    .bind(id, owner).first<{ status: string; customer_id: number; quantity: number }>();
  if (!current) return jsonError('Order not found.', 404);
  if (!(['requested','accepted'].includes(current.status) && ['out_for_delivery','delivered'].includes(status)) && !(current.status === 'out_for_delivery' && status === 'delivered')) return jsonError('Order changed. Refresh and retry.', 409);
  const now = new Date().toISOString();
  if (status === 'delivered') {
    const returned = Number(body?.returnedCans ?? 0);
    const paid = Number(body?.paidCents ?? 0);
    const method = String(body?.method ?? 'cash');
    if (!Number.isInteger(returned) || returned < 0 || returned > 100 || !Number.isInteger(paid) || paid < 0 || paid > 10000000 || !['cash', 'upi', 'other'].includes(method)) return jsonError('Check returned cans and payment.', 400);
    const statements = [
      database().prepare("UPDATE app_orders SET status=?,returned_cans=?,updated_at=? WHERE id=? AND distributor_id=? AND status=? AND ? <= quantity + COALESCE((SELECT SUM(quantity-returned_cans) FROM app_orders WHERE customer_id=? AND distributor_id=? AND status='delivered'),0) - COALESCE((SELECT SUM(quantity) FROM app_can_collections WHERE customer_id=? AND distributor_id=?),0)").bind(status, returned, now, id, owner, current.status,returned,current.customer_id,owner,current.customer_id,owner),
      database().prepare("UPDATE app_customers SET last_delivered_at=?,usual_quantity=?,updated_at=? WHERE id=? AND distributor_id=? AND EXISTS (SELECT 1 FROM app_orders WHERE id=? AND distributor_id=? AND status='delivered' AND updated_at=?)").bind(now, current.quantity, now, current.customer_id, owner, id, owner, now),
    ];
    if (paid) statements.push(database().prepare("INSERT INTO app_payments (distributor_id,customer_id,order_id,amount_cents,method,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM app_orders WHERE id=? AND distributor_id=? AND status='delivered' AND updated_at=?)").bind(owner, current.customer_id, id, paid, method, now, id, owner, now));
    const result = await database().batch(statements);
    if (!result[0].meta.changes) return jsonError('Order changed. Refresh and retry.', 409);
  } else {
    const result = await database().prepare('UPDATE app_orders SET status=?,updated_at=? WHERE id=? AND distributor_id=? AND status=?').bind(status, now, id, owner, current.status).run();
    if (!result.meta.changes) return jsonError('Order changed. Refresh and retry.', 409);
  }
  return Response.json({ ok: true });
}
