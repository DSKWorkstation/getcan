# GetCan commercial foundation

The existing public demo remains separate. This project is the distributor and customer application intended for a fresh Cloudflare deployment. It is not yet live and must not accept real subscriptions until the integrations below are configured and tested.

## What works in the application

- Distributor phone OTP sign-in, session cookies and separated distributor records.
- ₹50/month founding subscription gate through Razorpay Subscriptions, with signed webhook updates.
- Distributor customer list, orders on behalf of customers, default can count, frequency estimate, global price per can, delivery and cash/empty-can recording.
- Personal customer link for one-tap requests with editable can count.

## Account setup before launch

1. Create a separate Cloudflare Workers project with a D1 database bound as `DB`; apply the SQL files in `drizzle/` in order to that new database. Do not point this at the public demo database.
2. Configure a Cloudflare Turnstile site key for the final hostname and set `TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET` (secret).
3. Approve a GetCan login OTP DLT template in the TechServices MSG91 account. Set `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` as secrets. Test a real Indian phone number and provider response.
4. In Razorpay, create a monthly INR 50 (5000 paise) plan under TechServices. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, and `RAZORPAY_WEBHOOK_SECRET` as secrets. Register `https://getcan.in/api/commercial/razorpay-webhook` for subscription events. Test activation, cancellation, and expiry using Razorpay's test environment before live keys.
5. Deploy the Worker build and connect `getcan.in` / `www.getcan.in` to this new project only after production verification. DNS at the registrar will need the Cloudflare values shown by that account. The current demo custom-domain attachment must be removed before the same domain can point to a separate app.
6. Smoke-test OTP, first paid sign-up, customer link, duplicate request, delivery, and plan expiry on a staging hostname. Then enable live keys and update the public domain.

## Local verification

`npm run build` and `npx tsc --noEmit` passed on 2026-09-28. Migration constraints were exercised with an in-memory SQLite database. End-to-end provider flows require the account settings above and have not been tested.

## Security and product notes

The customer URL is a bearer link: anyone holding it can request for that customer. It should be shared privately; customer phone verification and link rotation are needed before wider rollout. A request cannot be placed twice while one is open. All distributor API queries are scoped to the signed-in distributor. A real operations review should test webhook retries, account recovery, refund policy, invoice/tax handling, and actual mobile delivery UX before commercial launch.

## Multiple suppliers for one household

Allow the same phone number in more than one distributor's customer book. Each supplier-customer relationship has its own request link, price, usual quantity, orders, balance and empty-can account. A link opens the named supplier's order page and creates an order only for that supplier. One supplier cannot access another's records. The database already enforces uniqueness within a distributor, not globally.

For a future unified customer home, require customer phone verification before showing linked suppliers. The customer should explicitly claim or approve each supplier relationship, then choose a supplier card before tapping the can. Never auto-merge records or reveal other suppliers just because phone numbers match. Supplier links should remain independently usable while this customer account is built. Rotation/revocation of a lost personal link remains a launch requirement.

## Delivery route workflow

Accepted requests become stops. The supplier moves stops up or down to select a delivery sequence, then starts the route once. This marks accepted stops out for delivery. The first outstanding stop is highlighted; each stop offers call, map and complete delivery. Completing a stop records returned cans and cash and removes it from the outstanding route. The saved route order is scoped to the distributor and persists across devices. A map link navigates to one address; this version does not calculate a traffic-optimized 30-stop itinerary.

## Phone-first distributor intake

The primary New order action opens a small phone-first sheet from any distributor tab. A 10-digit number checks only this distributor's customer book. Existing customers show their name and suggested usual quantity. New numbers can be ordered immediately with optional name and address; a new customer record and private request link are created in the same database transaction as the order. Customers can also be saved without placing an order. The Customers tab lets the supplier add a name, address, usual can count and delivery frequency later. A new link can be copied or opened as a WhatsApp draft by the supplier; GetCan does not send messages automatically.

On devices with the browser Contact Picker API, the sheet offers Contacts. Browsers do not expose recent call history to websites. Manual number entry and recent customers in GetCan remain the reliable fallback. English, Tamil and Hindi labels cover the primary navigation and intake actions; a complete translation review with native speakers is needed before a broad multilingual release.
