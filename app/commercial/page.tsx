import { env } from 'cloudflare:workers';
import CommercialApp from './commercial-app';

export const dynamic = 'force-dynamic';

export default function Page() {
  const ready = env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_PLAN_ID && env.RAZORPAY_WEBHOOK_SECRET;
  if (!ready) return <main className="gc-app"><header className="gc-header"><span className="gc-brand">getcan.</span></header><section className="gc-login"><span className="gc-eyebrow">GETCAN FOR DISTRIBUTORS</span><h1>Getting ready for your first delivery.</h1><p>Ordering, delivery and collections will open here once phone sign-in and subscription payments are activated.</p><div className="gc-plan"><strong>₹50 <small>/ month</small></strong><span>60 days free · then ₹50/month</span></div><p>Registration is opening soon.</p></section></main>;
  return <CommercialApp turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? ''} />;
}
