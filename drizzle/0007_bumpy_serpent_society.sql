CREATE TABLE `app_customer_links` (
	`customer_id` integer PRIMARY KEY NOT NULL,
	`distributor_id` integer NOT NULL,
	`token` text NOT NULL,
	`token_hash` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_customer_links_token_hash_unique` ON `app_customer_links` (`token_hash`);--> statement-breakpoint
ALTER TABLE `app_customers` ADD `area` text DEFAULT '' NOT NULL;