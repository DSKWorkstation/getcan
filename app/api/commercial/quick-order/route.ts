import { activeDistributorId, database, jsonError, phoneNumber, positiveInt, randomToken, sha256 } from '@/lib/commercial';

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to find a customer.', 401);
  const params = new URL(request.url).searchParams;
  const query = params.get('query')?.trim().slice(0, 80);
  if (query && query.length >= 2) {
    const matches = await database().prepare('SELECT id,name,phone,address,area,usual_quantity FROM app_customers WHERE distributor_id=? AND (instr(lower(name),lower(?))>0 OR instr(phone,?)>0) ORDER BY updated_at DESC LIMIT 12').bind(owner, query, query).all();
    return Response.json({ suggestions: matches.results });
  }
  const phone = phoneNumber(params.get('phone'));
  if (!phone) return jsonError('Enter a 10-digit mobile number.', 400);
  const customer = await database().prepare('SELECT id,name,phone,address,area,usual_quantity FROM app_customers WHERE distributor_id=? AND phone=?').bind(owner, phone).first();
  return Response.json({ customer });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to place an order.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const phone = phoneNumber(body?.phone);
  const quantity = positiveInt(body?.quantity, 50);
  if (!phone || !quantity) return jsonError('Enter a mobile number and 1–50 cans.', 400);
  const name = String(body?.name ?? '').trim().slice(0, 80) || `Customer ${phone.slice(-4)}`;
  const address = String(body?.address ?? '').trim().slice(0, 240);
  const area = String(body?.area ?? '').trim().slice(0,80);
  const now = new Date().toISOString();
  const token = randomToken();
  const db = database();
  try {
    const [created, order] = await db.batch([
      db.prepare('INSERT OR IGNORE INTO app_customers (distributor_id,name,phone,address,area,usual_quantity,frequency_days,request_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,7,?,?,?)')
        .bind(owner, name, phone, address, area, quantity, await sha256(token), now, now),
      db.prepare("INSERT INTO app_orders (distributor_id,customer_id,quantity,price_cents,status,source,created_at,updated_at) SELECT ?,c.id,?,d.default_price_cents,'requested','distributor',?,? FROM app_customers c JOIN app_distributors d ON d.id=c.distributor_id WHERE c.distributor_id=? AND c.phone=? RETURNING id,customer_id")
        .bind(owner, quantity, now, now, owner, phone),
    ]);
    const row = order.results?.[0] as { id: number; customer_id: number } | undefined;
    if (!row) return jsonError('Could not place the order.', 503);
    await db.prepare('INSERT OR IGNORE INTO app_customer_links (customer_id,distributor_id,token,token_hash) VALUES (?,?,?,?)').bind(row.customer_id,owner,token,await sha256(token)).run();
    const link=await db.prepare('SELECT token FROM app_customer_links WHERE customer_id=? AND distributor_id=?').bind(row.customer_id,owner).first<{token:string}>();
    return Response.json({ id: row.id, customerId: row.customer_id, newCustomer: !!created.meta.changes, requestLink: `${new URL(request.url).origin}/c/${link!.token}` }, { status: 201 });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('This customer already has an open order.', 409);
    throw error;
  }
}
