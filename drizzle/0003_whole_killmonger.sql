CREATE TABLE `app_customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distributor_id` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`usual_quantity` integer DEFAULT 2 NOT NULL,
	`frequency_days` integer DEFAULT 7 NOT NULL,
	`last_delivered_at` text,
	`request_token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_customers_request_token_hash_unique` ON `app_customers` (`request_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_customers_distributor_phone` ON `app_customers` (`distributor_id`,`phone`);--> statement-breakpoint
CREATE TABLE `app_distributors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT 'My distribution' NOT NULL,
	`default_price_cents` integer DEFAULT 3500 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_distributors_phone_unique` ON `app_distributors` (`phone`);--> statement-breakpoint
CREATE TABLE `app_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distributor_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`returned_cans` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`source` text DEFAULT 'customer' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_orders_distributor_created` ON `app_orders` (`distributor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `app_otp_attempts` (
	`phone` text PRIMARY KEY NOT NULL,
	`sent_at` text NOT NULL,
	`send_count` integer DEFAULT 1 NOT NULL,
	`verify_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distributor_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`order_id` integer,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `app_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_payments_distributor_customer` ON `app_payments` (`distributor_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`distributor_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_sessions_distributor` ON `app_sessions` (`distributor_id`);--> statement-breakpoint
CREATE TABLE `app_subscriptions` (
	`distributor_id` integer PRIMARY KEY NOT NULL,
	`razorpay_id` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`current_end_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_subscriptions_razorpay_id_unique` ON `app_subscriptions` (`razorpay_id`);--> statement-breakpoint
CREATE TABLE `app_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`received_at` text NOT NULL
);
