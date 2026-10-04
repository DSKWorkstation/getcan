import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customer: text("customer").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  quantity: integer("quantity").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("requested"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  customerId: integer("customer_id"),
  priceCents: integer("price_cents").notNull().default(0),
  returnedCans: integer("returned_cans").notNull().default(0),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  address: text("address").notNull().default(""),
  usualQuantity: integer("usual_quantity").notNull().default(2),
  frequencyDays: integer("frequency_days").notNull().default(7),
  lastDeliveredAt: text("last_delivered_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const distributorSettings = sqliteTable("distributor_settings", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default("Your distribution"),
  defaultPriceCents: integer("default_price_cents").notNull().default(3500),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  createdAt: text("created_at").notNull(),
});

// Commercial data is deliberately separate from the shared public demo tables.
// Every operational row belongs to a distributor. Phone numbers can repeat
// across distributors because each distributor owns their own customer book.
export const appDistributors = sqliteTable("app_distributors", {
  inviteCode: text("invite_code").unique(),
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull().default("My distribution"),
  defaultPriceCents: integer("default_price_cents").notNull().default(3500),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appCustomers = sqliteTable("app_customers", {
  area: text("area").notNull().default(""),
  id: integer("id").primaryKey({ autoIncrement: true }),
  distributorId: integer("distributor_id").notNull().references(() => appDistributors.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull().default(""),
  usualQuantity: integer("usual_quantity").notNull().default(2),
  frequencyDays: integer("frequency_days").notNull().default(7),
  lastDeliveredAt: text("last_delivered_at"),
  // A random token is shown in the customer's personal request link. Only its
  // SHA-256 digest is stored, so a database read cannot expose live links.
  requestTokenHash: text("request_token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("app_customers_distributor_phone").on(t.distributorId, t.phone)]);

// Reshareable bearer links are private distributor data; never include in public lists.
export const appCustomerLinks = sqliteTable("app_customer_links", {
 customerId: integer("customer_id").primaryKey().references(() => appCustomers.id),
 distributorId: integer("distributor_id").notNull().references(() => appDistributors.id),
 token: text("token").notNull(),
 tokenHash: text("token_hash").notNull().unique(),
});

export const appOrders = sqliteTable("app_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  distributorId: integer("distributor_id").notNull().references(() => appDistributors.id),
  customerId: integer("customer_id").notNull().references(() => appCustomers.id),
  quantity: integer("quantity").notNull(),
  priceCents: integer("price_cents").notNull(),
  returnedCans: integer("returned_cans").notNull().default(0),
  routeRank: integer("route_rank").notNull().default(0),
  status: text("status").notNull().default("requested"),
  source: text("source").notNull().default("customer"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("app_orders_distributor_created").on(t.distributorId, t.createdAt),
  index("app_orders_owner_customer_status").on(t.distributorId,t.customerId,t.status),
  uniqueIndex("app_orders_one_open_per_customer").on(t.customerId).where(sql`status <> 'delivered'`),
]);

export const appPayments = sqliteTable("app_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  distributorId: integer("distributor_id").notNull().references(() => appDistributors.id),
  customerId: integer("customer_id").notNull().references(() => appCustomers.id),
  orderId: integer("order_id").references(() => appOrders.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("app_payments_distributor_customer").on(t.distributorId, t.customerId)]);

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  distributorId: integer("distributor_id").notNull().references(() => appDistributors.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("app_sessions_distributor").on(t.distributorId)]);

export const appOtpAttempts = sqliteTable("app_otp_attempts", {
  phone: text("phone").primaryKey(),
  sentAt: text("sent_at").notNull(),
  sendCount: integer("send_count").notNull().default(1),
  verifyCount: integer("verify_count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
});

export const appSubscriptions = sqliteTable("app_subscriptions", {
  distributorId: integer("distributor_id").primaryKey().references(() => appDistributors.id),
  razorpayId: text("razorpay_id").unique(),
  checkoutUrl: text("checkout_url"),
  status: text("status").notNull().default("not_started"),
  currentEndAt: text("current_end_at"),
  updatedAt: text("updated_at").notNull(),
});

export const appWebhookEvents = sqliteTable("app_webhook_events", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: text("received_at").notNull(),
});

export const appCanCollections = sqliteTable("app_can_collections", {
 id: integer("id").primaryKey({autoIncrement:true}),
 distributorId: integer("distributor_id").notNull().references(()=>appDistributors.id),
 customerId: integer("customer_id").notNull().references(()=>appCustomers.id),
 quantity: integer("quantity").notNull(),
 receipt: text("receipt").notNull().unique(),
 createdAt: text("created_at").notNull(),
},t=>[index("app_can_collections_owner_customer").on(t.distributorId,t.customerId)]);
