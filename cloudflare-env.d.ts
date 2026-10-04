declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MSG91_AUTH_KEY?: string;
    MSG91_OTP_TEMPLATE_ID?: string;
    TURNSTILE_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_PLAN_ID?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    LINK_SECRET?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  }
}
