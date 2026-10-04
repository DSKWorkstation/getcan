import { activeDistributorId, database, jsonError, positiveInt } from '@/lib/commercial';

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const rows = await database().prepare('SELECT id,customer_id,order_id,amount_cents,method,created_at FROM app_payments WHERE distributor_id=? ORDER BY id DESC LIMIT 500')
    .bind(owner).all();
  return Response.json({ payments: rows.results });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('An active distributor plan is required.', 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerId = positiveInt(body?.customerId, 2147483647);
  const amount = positiveInt(body?.amountCents, 10000000);
  const method = String(body?.method ?? 'cash');
  if (!customerId || !amount || !['cash', 'upi', 'other'].includes(method)) return jsonError('Check the customer and payment amount.', 400);
  const customer = await database().prepare('SELECT id FROM app_customers WHERE id=? AND distributor_id=?').bind(customerId, owner).first();
  if (!customer) return jsonError('Customer not found.', 404);
  const row = await database().prepare('INSERT INTO app_payments (distributor_id,customer_id,amount_cents,method,created_at) VALUES (?,?,?,?,?) RETURNING id')
    .bind(owner, customerId, amount, method, new Date().toISOString()).first<{ id: number }>();
  return Response.json({ id: row?.id }, { status: 201 });
}
