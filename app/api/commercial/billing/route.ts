import { database, distributorId, jsonError } from '@/lib/commercial';
import { razorpayKeyId, razorpayPlanId, razorpayReady, razorpayRequest } from '@/lib/razorpay';

type Subscription = { razorpay_id: string | null; checkout_url: string | null; status: string; current_end_at: string | null };

export async function GET(request: Request) {
  const owner = await distributorId(request);
  if (!owner) return jsonError('Sign in to see your plan.', 401);
  const row = await database().prepare('SELECT razorpay_id,checkout_url,status,current_end_at FROM app_subscriptions WHERE distributor_id=?').bind(owner).first<Subscription>();
  const distributor=await database().prepare('SELECT created_at FROM app_distributors WHERE id=?').bind(owner).first<{created_at:string}>();
  const trialEnd=distributor ? new Date(Date.parse(distributor.created_at)+60*86400000).toISOString() : null;
  if(trialEnd && trialEnd>new Date().toISOString() && row?.status!=='active')return Response.json({plan:'₹50/month after 60 days free',status:'active',trialEnd,currentEndAt:trialEnd,checkoutUrl:null},{headers:{'Cache-Control':'no-store'}});
  return Response.json({ trialEnd: trialEnd && trialEnd>new Date().toISOString() ? trialEnd : null, plan: '₹50/month', status: row?.status ?? 'not_started', currentEndAt: row?.current_end_at ?? null, checkoutUrl: row?.checkout_url ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.', 403);
  const owner = await distributorId(request);
  if (!owner) return jsonError('Sign in to subscribe.', 401);
  if (!razorpayReady()) return jsonError('Subscriptions are not configured yet.', 503);
  const planResponse = await razorpayRequest(`plans/${encodeURIComponent(razorpayPlanId())}`);
  const plan = await planResponse.json().catch(() => null) as { period?: string; interval?: number; item?: { amount?: number; currency?: string }; error?: { description?: string } } | null;
  // Name the failing check so the owner can fix the Razorpay setup without guessing.
  const mode = razorpayKeyId().startsWith('rzp_live_') ? 'Live' : razorpayKeyId().startsWith('rzp_test_') ? 'Test' : 'unknown-mode';
  if (!planResponse.ok) console.error('razorpay plan fetch', planResponse.status, plan?.error?.description);
  if (planResponse.status === 401) return jsonError(`Razorpay rejected the ${mode} API keys. Re-enter RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.`, 503);
  if (!planResponse.ok) return jsonError(`Razorpay could not load plan ${razorpayPlanId()} with the ${mode} keys (${planResponse.status}: ${String(plan?.error?.description ?? 'no details').slice(0, 160)}). Check the plan ID and that the plan is in ${mode} mode.`, 503);
  if (plan?.period !== 'monthly' || plan.interval !== 1 || plan.item?.amount !== 5000 || plan.item.currency !== 'INR')
    return jsonError(`The Razorpay plan must be ₹50 every 1 month in INR. Plan ${razorpayPlanId()} is ${(plan?.item?.amount ?? 0) / 100} ${plan?.item?.currency ?? '?'} every ${plan?.interval ?? '?'} ${plan?.period ?? '?'}.`, 503);
  const previous = await database().prepare('SELECT razorpay_id,checkout_url,status FROM app_subscriptions WHERE distributor_id=?').bind(owner).first<Subscription>();
  if (previous?.razorpay_id) return Response.json({ status: previous.status, checkoutUrl: previous.checkout_url });
  // A pending marker prevents a double tap from creating two recurring mandates.
  const reserved = await database().prepare("INSERT INTO app_subscriptions (distributor_id,status,updated_at) VALUES (?,'creating',?) ON CONFLICT(distributor_id) DO UPDATE SET status='creating',updated_at=excluded.updated_at WHERE status='not_started' RETURNING distributor_id")
    .bind(owner, new Date().toISOString()).first();
  if (!reserved) return jsonError('Subscription setup is already in progress. Please refresh shortly.', 409);
  const response = await razorpayRequest('subscriptions', {
    method: 'POST',
    body: JSON.stringify({ plan_id: razorpayPlanId(), total_count: 120, quantity: 1, customer_notify: true, notes: { getcan_distributor_id: String(owner) } }),
  });
  const result = await response.json().catch(() => null) as { id?: string; short_url?: string } | null;
  if (!response.ok || !result?.id || !result.short_url) {
    await database().prepare("UPDATE app_subscriptions SET status='not_started' WHERE distributor_id=? AND status='creating'").bind(owner).run();
    return jsonError('Could not create the subscription. Try again.', 502);
  }
  await database().prepare("UPDATE app_subscriptions SET razorpay_id=?,checkout_url=?,status='created',updated_at=? WHERE distributor_id=? AND status='creating'")
    .bind(result.id, result.short_url, new Date().toISOString(), owner).run();
  return Response.json({ status: 'created', checkoutUrl: result.short_url });
}
