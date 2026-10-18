CREATE TABLE `app_price_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distributor_id` integer NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`distributor_id`) REFERENCES `app_distributors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_price_groups_distributor` ON `app_price_groups` (`distributor_id`);--> statement-breakpoint
ALTER TABLE `app_customers` ADD `price_group_id` integer REFERENCES app_price_groups(id);