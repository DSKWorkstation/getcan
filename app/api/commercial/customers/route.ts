import { activeDistributorId, database, jsonError, phoneNumber, positiveInt, randomToken, sha256 } from '@/lib/commercial';
import { saveLink } from '@/lib/links';

export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to view your customers.', 401);
  const rows = await database().prepare('SELECT id,name,phone,address,area,usual_quantity,frequency_days,last_delivered_at,created_at,updated_at FROM app_customers WHERE distributor_id=? ORDER BY updated_at DESC LIMIT 500').bind(owner).all();
  return Response.json({ customers: rows.results });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to add a customer.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const phone = phoneNumber(body?.phone);
  const name = String(body?.name ?? '').trim().slice(0, 80) || (phone ? `Customer ${phone.slice(-4)}` : '');
  const area = String(body?.area ?? '').trim().slice(0,80);
  const address = String(body?.address ?? '').trim().slice(0, 240);
  const quantity = positiveInt(body?.usualQuantity ?? 2, 50);
  const frequency = positiveInt(body?.frequencyDays ?? 7, 90);
  if (!phone || !name || !quantity || !frequency) return jsonError('Check the name, phone, quantity and frequency.', 400);
  const token = randomToken();
  const now = new Date().toISOString();
  try {
    const row = await database().prepare('INSERT INTO app_customers (distributor_id,name,phone,address,area,usual_quantity,frequency_days,request_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(owner, name, phone, address, area, quantity, frequency, await sha256(token), now, now).first<{ id: number }>();
    if (row) await saveLink(owner, row.id, token);
    return Response.json({ id: row?.id, requestLink: `${new URL(request.url).origin}/c/${token}` }, { status: 201 });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('This phone is already in your customer list.', 409);
    throw error;
  }
}

export async function PATCH(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.',403);
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to edit a customer.', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = positiveInt(body?.id, 2147483647);
  if (!id) return jsonError('Choose a customer.', 400);
  const current = await database().prepare('SELECT * FROM app_customers WHERE id=? AND distributor_id=?').bind(id, owner).first<Record<string, unknown>>();
  if (!current) return jsonError('Customer not found.', 404);
  const phone = phoneNumber(body?.phone ?? current.phone);
  const name = String(body?.name ?? current.name).trim().slice(0, 80);
  const area = String(body?.area ?? current.area ?? '').trim().slice(0,80);
  const address = String(body?.address ?? current.address).trim().slice(0, 240);
  const quantity = positiveInt(body?.usualQuantity ?? current.usual_quantity, 50);
  const frequency = positiveInt(body?.frequencyDays ?? current.frequency_days, 90);
  if (!phone || !name || !quantity || !frequency) return jsonError('Check the customer details.', 400);
  try {
    await database().prepare('UPDATE app_customers SET name=?,phone=?,address=?,area=?,usual_quantity=?,frequency_days=?,updated_at=? WHERE id=? AND distributor_id=?')
      .bind(name, phone, address, area, quantity, frequency, new Date().toISOString(), id, owner).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('This phone is already in your customer list.', 409);
    throw error;
  }
}
