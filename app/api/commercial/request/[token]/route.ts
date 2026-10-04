import { customerByToken, distributorHasAccess, database, jsonError, positiveInt, type LinkedCustomer } from '@/lib/commercial';
import { notify, pushPublicKey } from '@/lib/push';

type Context = { params: Promise<{ token: string }> };
// Customers can change or cancel a request until the distributor dispatches it.
const changeable = "status IN ('requested','accepted')";

async function findCustomer(context: Context): Promise<LinkedCustomer | null> {
  const { token } = await context.params;
  return customerByToken(token);
}

async function openCustomer(context: Context): Promise<LinkedCustomer | Response> {
  const customer = await findCustomer(context);
  if (!customer) return jsonError('This request link is invalid.', 404);
  if (!await distributorHasAccess(customer.distributor_id)) return jsonError('This distributor is not accepting requests right now.', 403);
  return customer;
}

export async function GET(_request: Request, context: Context) {
  const customer = await openCustomer(context);
  if (customer instanceof Response) return customer;
  const owner = customer.distributor_id;
  const [distributor, orders, account] = await Promise.all([
    database().prepare('SELECT name,default_price_cents,upi_id FROM app_distributors WHERE id=?').bind(owner).first(),
    database().prepare('SELECT id,quantity,price_cents,status,created_at FROM app_orders WHERE distributor_id=? AND customer_id=? ORDER BY id DESC LIMIT 10').bind(owner, customer.id).all(),
    database().prepare(`SELECT
      COALESCE((SELECT SUM(quantity*price_cents) FROM app_orders WHERE customer_id=?1 AND distributor_id=?2 AND status='delivered'),0)-COALESCE((SELECT SUM(amount_cents) FROM app_payments WHERE customer_id=?1 AND distributor_id=?2),0) AS balance_cents,
      COALESCE((SELECT SUM(quantity-returned_cans) FROM app_orders WHERE customer_id=?1 AND distributor_id=?2 AND status='delivered'),0)-COALESCE((SELECT SUM(quantity) FROM app_can_collections WHERE customer_id=?1 AND distributor_id=?2),0) AS cans_out`)
      .bind(customer.id, owner).first<{ balance_cents: number; cans_out: number }>(),
  ]);
  return Response.json({
    customer: { name: customer.name, address: customer.address, usualQuantity: customer.usual_quantity },
    distributor, orders: orders.results,
    account: { balanceCents: account?.balance_cents ?? 0, cansOut: account?.cans_out ?? 0 },
    pushKey: pushPublicKey(),
  }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function POST(request: Request, context: Context) {
  const customer = await openCustomer(context);
  if (customer instanceof Response) return customer;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const quantity = positiveInt(body?.quantity ?? customer.usual_quantity, 50);
  if (!quantity) return jsonError('Choose 1–50 cans.', 400);
  const open = await database().prepare("SELECT id FROM app_orders WHERE distributor_id=? AND customer_id=? AND status!='delivered' LIMIT 1")
    .bind(customer.distributor_id, customer.id).first();
  if (open) return jsonError('A request is already open. Your distributor can see it.', 409);
  const settings = await database().prepare('SELECT default_price_cents FROM app_distributors WHERE id=?').bind(customer.distributor_id).first<{ default_price_cents: number }>();
  const now = new Date().toISOString();
  try {
    const row = await database().prepare("INSERT INTO app_orders (distributor_id,customer_id,quantity,price_cents,status,source,created_at,updated_at) VALUES (?,?,?,?,'requested','customer',?,?) RETURNING id")
      .bind(customer.distributor_id, customer.id, quantity, settings?.default_price_cents ?? 3500, now, now).first<{ id: number }>();
    await notify({ distributorId: customer.distributor_id, kind: 'distributor' }, { title: 'New water request', body: `${customer.name} · ${quantity} ${quantity === 1 ? 'can' : 'cans'}`, url: '/commercial' });
    return Response.json({ id: row?.id, status: 'requested' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('A request is already open.', 409);
    throw error;
  }
}

export async function PATCH(request: Request, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const customer = await openCustomer(context);
  if (customer instanceof Response) return customer;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = positiveInt(body?.id, 2147483647), quantity = positiveInt(body?.quantity, 50);
  if (!id || !quantity) return jsonError('Choose 1–50 cans.', 400);
  const result = await database().prepare(`UPDATE app_orders SET quantity=?,updated_at=? WHERE id=? AND customer_id=? AND distributor_id=? AND ${changeable}`)
    .bind(quantity, new Date().toISOString(), id, customer.id, customer.distributor_id).run();
  if (!result.meta.changes) return jsonError('This order is already on the way and can no longer be changed.', 409);
  await notify({ distributorId: customer.distributor_id, kind: 'distributor' }, { title: 'Order changed', body: `${customer.name} now needs ${quantity} ${quantity === 1 ? 'can' : 'cans'}`, url: '/commercial' });
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const customer = await openCustomer(context);
  if (customer instanceof Response) return customer;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = positiveInt(body?.id, 2147483647);
  if (!id) return jsonError('Choose an order.', 400);
  // A dispatched order cannot be withdrawn, and undelivered orders carry no
  // payments, so removing the row leaves the ledger untouched.
  const result = await database().prepare(`DELETE FROM app_orders WHERE id=? AND customer_id=? AND distributor_id=? AND ${changeable}`)
    .bind(id, customer.id, customer.distributor_id).run();
  if (!result.meta.changes) return jsonError('This order is already on the way and can no longer be cancelled.', 409);
  await notify({ distributorId: customer.distributor_id, kind: 'distributor' }, { title: 'Order cancelled', body: `${customer.name} cancelled their request`, url: '/commercial' });
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
