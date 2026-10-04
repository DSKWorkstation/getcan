CREATE TABLE `app_can_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distributor_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`receipt` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_can_collections_receipt_unique` ON `app_can_collections` (`receipt`);--> statement-breakpoint
CREATE INDEX `app_can_collections_owner_customer` ON `app_can_collections` (`distributor_id`,`customer_id`);--> statement-breakpoint
ALTER TABLE `app_distributors` ADD `invite_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `app_distributors_invite_code_unique` ON `app_distributors` (`invite_code`);