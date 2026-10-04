import { distributorHasAccess, database, jsonError, positiveInt, sha256 } from '@/lib/commercial';

type Context = { params: Promise<{ token: string }> };
type Customer = { id: number; distributor_id: number; name: string; address: string; usual_quantity: number; request_token_hash: string };

async function findCustomer(context: Context): Promise<Customer | null> {
  const { token } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return database().prepare('SELECT id,distributor_id,name,address,usual_quantity,request_token_hash FROM app_customers WHERE request_token_hash=? OR id IN (SELECT customer_id FROM app_customer_links WHERE token_hash=?)')
    .bind(await sha256(token),await sha256(token)).first<Customer>();
}

export async function GET(_request: Request, context: Context) {
  const customer = await findCustomer(context);
  if (!customer) return jsonError('This request link is invalid.', 404);
  if (!await distributorHasAccess(customer.distributor_id)) return jsonError('This distributor is not accepting requests right now.', 403);
  const [distributor, orders] = await Promise.all([
    database().prepare('SELECT name,default_price_cents FROM app_distributors WHERE id=?').bind(customer.distributor_id).first(),
    database().prepare('SELECT id,quantity,price_cents,status,created_at FROM app_orders WHERE distributor_id=? AND customer_id=? ORDER BY id DESC LIMIT 10').bind(customer.distributor_id, customer.id).all(),
  ]);
  return Response.json({ customer: { name: customer.name, address: customer.address, usualQuantity: customer.usual_quantity }, distributor, orders: orders.results }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function POST(request: Request, context: Context) {
  const customer = await findCustomer(context);
  if (!customer) return jsonError('This request link is invalid.', 404);
  if (!await distributorHasAccess(customer.distributor_id)) return jsonError('This distributor is not accepting requests right now.', 403);
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
    return Response.json({ id: row?.id, status: 'requested' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('A request is already open.', 409);
    throw error;
  }
}
