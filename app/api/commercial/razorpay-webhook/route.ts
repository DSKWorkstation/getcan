import { database, jsonError } from '@/lib/commercial';
import { razorpayRequest, validWebhook } from '@/lib/razorpay';

type Subscription = { id?: string; status?: string; current_end?: number | null };

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  if (!(await validWebhook(raw, signature))) {
    // Shows in `wrangler tail` when the Razorpay webhook secret and RAZORPAY_WEBHOOK_SECRET differ.
    console.error('razorpay webhook: invalid signature', request.headers.get('x-razorpay-event-id'));
    return jsonError('Invalid signature.', 401);
  }
  const eventId = request.headers.get('x-razorpay-event-id');
  if (!eventId || eventId.length > 120) return jsonError('Missing event ID.', 400);
  const payload = JSON.parse(raw) as { event?: string; payload?: { subscription?: { entity?: Subscription } } };
  const subscriptionId = payload.payload?.subscription?.entity?.id;
  if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return Response.json({ ignored: true });
  const known = await database().prepare('SELECT distributor_id FROM app_subscriptions WHERE razorpay_id=?').bind(subscriptionId).first<{ distributor_id: number }>();
  if (!known) return Response.json({ ignored: true });
  // Fetch the current Razorpay state: webhooks can be delayed or arrive out of order.
  const response = await razorpayRequest(`subscriptions/${subscriptionId}`);
  if (!response.ok) return jsonError('Subscription status temporarily unavailable.', 503);
  const current = await response.json() as Subscription;
  if (current.id !== subscriptionId || !current.status) return jsonError('Invalid subscription response.', 502);
  const endAt = current.current_end ? new Date(current.current_end * 1000).toISOString() : null;
  const now = new Date().toISOString();
  await database().batch([
    database().prepare('INSERT OR IGNORE INTO app_webhook_events (id,event,received_at) VALUES (?,?,?)').bind(eventId, String(payload.event ?? '').slice(0, 80), now),
    database().prepare('UPDATE app_subscriptions SET status=?,current_end_at=?,updated_at=? WHERE razorpay_id=?').bind(current.status, endAt, now, subscriptionId),
  ]);
  return Response.json({ ok: true });
}
