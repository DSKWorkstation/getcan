ALTER TABLE `app_distributors` ADD `onboarded_at` text;--> statement-breakpoint
UPDATE `app_distributors` SET `onboarded_at` = `updated_at` WHERE `name` <> 'My distribution';
