CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`usual_quantity` integer DEFAULT 2 NOT NULL,
	`frequency_days` integer DEFAULT 7 NOT NULL,
	`last_delivered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `distributor_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Your distribution' NOT NULL,
	`default_price_cents` integer DEFAULT 3500 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `price_cents` integer DEFAULT 0 NOT NULL;