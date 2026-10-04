import { activeDistributorId, database, jsonError, positiveInt } from '@/lib/commercial';

// Monthly account statement for one customer, in India time. A delivery counts
// in the month it was completed; payments and empty-can pickups by their date.
export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to see statements.', 401);
  const params = new URL(request.url).searchParams;
  const customerId = positiveInt(params.get('customerId'), 2147483647);
  const month = params.get('month') ?? '';
  if (!customerId || !/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)) return jsonError('Choose a customer and month.', 400);
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(`${month}-01T00:00:00+05:30`).toISOString();
  const end = new Date(`${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, '0')}-01T00:00:00+05:30`).toISOString();
  const db = database();
  const customer = await db.prepare('SELECT id,name,phone,address FROM app_customers WHERE id=? AND distributor_id=?').bind(customerId, owner).first<{ id: number; name: string; phone: string; address: string }>();
  if (!customer) return jsonError('Customer not found.', 404);
  const [distributor, opening, deliveries, payments, collections] = await Promise.all([
    db.prepare('SELECT name,upi_id FROM app_distributors WHERE id=?').bind(owner).first<{ name: string; upi_id: string }>(),
    db.prepare(`SELECT
      COALESCE((SELECT SUM(quantity*price_cents) FROM app_orders WHERE customer_id=?1 AND distributor_id=?2 AND status='delivered' AND updated_at<?3),0)-COALESCE((SELECT SUM(amount_cents) FROM app_payments WHERE customer_id=?1 AND distributor_id=?2 AND created_at<?3),0) AS balance_cents,
      COALESCE((SELECT SUM(quantity-returned_cans) FROM app_orders WHERE customer_id=?1 AND distributor_id=?2 AND status='delivered' AND updated_at<?3),0)-COALESCE((SELECT SUM(quantity) FROM app_can_collections WHERE customer_id=?1 AND distributor_id=?2 AND created_at<?3),0) AS cans_out`)
      .bind(customerId, owner, start).first<{ balance_cents: number; cans_out: number }>(),
    db.prepare("SELECT id,quantity,price_cents,returned_cans,updated_at AS at FROM app_orders WHERE customer_id=? AND distributor_id=? AND status='delivered' AND updated_at>=? AND updated_at<? ORDER BY updated_at").bind(customerId, owner, start, end).all<{ id: number; quantity: number; price_cents: number; returned_cans: number; at: string }>(),
    db.prepare('SELECT id,amount_cents,method,created_at AS at FROM app_payments WHERE customer_id=? AND distributor_id=? AND created_at>=? AND created_at<? ORDER BY created_at').bind(customerId, owner, start, end).all<{ id: number; amount_cents: number; method: string; at: string }>(),
    db.prepare('SELECT id,quantity,created_at AS at FROM app_can_collections WHERE customer_id=? AND distributor_id=? AND created_at>=? AND created_at<? ORDER BY created_at').bind(customerId, owner, start, end).all<{ id: number; quantity: number; at: string }>(),
  ]);
  const charged = deliveries.results.reduce((n, d) => n + d.quantity * d.price_cents, 0);
  const paid = payments.results.reduce((n, p) => n + p.amount_cents, 0);
  const cansDelivered = deliveries.results.reduce((n, d) => n + d.quantity, 0);
  const cansReturned = deliveries.results.reduce((n, d) => n + d.returned_cans, 0) + collections.results.reduce((n, c) => n + c.quantity, 0);
  const openingBalance = opening?.balance_cents ?? 0, openingCans = opening?.cans_out ?? 0;
  return Response.json({
    month, customer, distributor: { name: distributor?.name ?? '', upiId: distributor?.upi_id ?? '' },
    openingBalanceCents: openingBalance, chargedCents: charged, paidCents: paid, closingBalanceCents: openingBalance + charged - paid,
    openingCans, cansDelivered, cansReturned, closingCans: openingCans + cansDelivered - cansReturned,
    deliveries: deliveries.results, payments: payments.results, collections: collections.results,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
