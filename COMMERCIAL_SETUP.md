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

## Customer links, alerts and payments (added October 2026)

These features need one new database migration and three new secrets on an existing deployment:

1. Apply `drizzle/0010_grey_corsair.sql` to the production D1 database, for example `npx wrangler d1 execute getcan-db --remote --file drizzle/0010_grey_corsair.sql`.
2. Set `LINK_SECRET` to a long random value (`npx wrangler secret put LINK_SECRET`). Customer links are then stored sealed with this secret, and links saved earlier are sealed the next time the distributor opens the desk. Keep this secret stable: if it changes or is removed, every customer link is replaced with a new one the next time it is shared.
3. Run `node scripts/generate-vapid-keys.mjs` once and save the two printed values as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Optionally set `VAPID_SUBJECT` to `mailto:` plus a support address. Without these keys everything works except phone notifications.

What each feature does:

- **Link reset.** Share order link has a New link button. The old link stops working at once, and alerts registered with it are removed.
- **Customer page.** English, Tamil and Hindi (chosen from the phone's language, changeable). The customer can change the number of cans or cancel until the order is dispatched, and sees their amount due, empty cans and recent deliveries. When the distributor adds a UPI ID in Settings, customers with dues get a Pay by UPI button.
- **Alerts.** The distributor's bell turns on phone notifications for new, changed and cancelled requests; with the desk open, new requests also chime. Customers can turn on alerts for when their water is on the way and delivered.
- **Offline.** The desk opens from the last saved copy when there is no signal. Deliveries and empty-can pickups made offline are sent automatically when the connection returns; anything the server rejects is shown.
- **Statements and reminders.** Ledger has a monthly statement per customer (WhatsApp or print). May need water soon has a Remind button that opens a WhatsApp draft with the customer's order link. Payments can be recorded as cash or UPI.

## Tests

`npm test` runs the route handlers against an in-memory SQLite copy of the D1 schema (all migrations applied) with MSG91, Turnstile, Razorpay and push services mocked. It covers sign-in, orders and the customer page, links, the Razorpay webhook and billing, and alerts.

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
