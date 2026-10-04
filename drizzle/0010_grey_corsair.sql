CREATE TABLE `app_push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`distributor_id` integer NOT NULL,
	`customer_id` integer,
	`last_title` text DEFAULT '' NOT NULL,
	`last_body` text DEFAULT '' NOT NULL,
	`last_url` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_push_subscriptions_owner` ON `app_push_subscriptions` (`distributor_id`,`kind`,`customer_id`);--> statement-breakpoint
ALTER TABLE `app_customer_links` ADD `token_cipher` text;--> statement-breakpoint
ALTER TABLE `app_distributors` ADD `upi_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `app_orders_owner_status` ON `app_orders` (`distributor_id`,`status`);