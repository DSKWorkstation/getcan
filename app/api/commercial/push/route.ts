import { activeDistributorId, customerByToken, database, jsonError } from '@/lib/commercial';
import { pushPublicKey, validEndpoint } from '@/lib/push';

// GET without an endpoint returns the public key; with one, the service worker
// reads the latest message for that device after a payload-free push.
export async function GET(request: Request) {
  const endpoint = new URL(request.url).searchParams.get('endpoint');
  if (!endpoint) return Response.json({ publicKey: pushPublicKey() }, { headers: { 'Cache-Control': 'no-store' } });
  const row = await database().prepare('SELECT last_title,last_body,last_url FROM app_push_subscriptions WHERE endpoint=?').bind(endpoint).first<{ last_title: string; last_body: string; last_url: string }>();
  if (!row) return jsonError('Unknown device.', 404);
  return Response.json({ title: row.last_title || 'GetCan', body: row.last_body, url: row.last_url }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  if (!pushPublicKey()) return jsonError('Notifications are not configured yet.', 503);
  const body = await request.json().catch(() => null) as { endpoint?: unknown; token?: unknown } | null;
  if (!validEndpoint(body?.endpoint)) return jsonError('This browser cannot receive notifications.', 400);
  let owner: number | null = null, customerId: number | null = null;
  if (body?.token !== undefined) {
    const customer = await customerByToken(body.token);
    if (!customer) return jsonError('This request link is invalid.', 404);
    owner = customer.distributor_id; customerId = customer.id;
  } else {
    owner = await activeDistributorId(request);
    if (!owner) return jsonError('Sign in to turn on alerts.', 401);
  }
  await database().prepare(`INSERT INTO app_push_subscriptions (endpoint,kind,distributor_id,customer_id,created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET kind=excluded.kind,distributor_id=excluded.distributor_id,customer_id=excluded.customer_id`)
    .bind(body!.endpoint, customerId ? 'customer' : 'distributor', owner, customerId, new Date().toISOString()).run();
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== 'string') return jsonError('Choose a device.', 400);
  await database().prepare('DELETE FROM app_push_subscriptions WHERE endpoint=?').bind(body.endpoint).run();
  return Response.json({ ok: true });
}
