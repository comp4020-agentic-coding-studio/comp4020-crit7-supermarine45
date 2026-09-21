CREATE TABLE `residence_gallery_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`residence_id` integer NOT NULL,
	`url` text NOT NULL,
	`alt` text NOT NULL,
	`sequence` integer NOT NULL,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `residence_rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`residence_id` integer NOT NULL,
	`name` text NOT NULL,
	`weekly_tariff` real,
	`contract_term` text,
	`inclusions` text NOT NULL,
	`other_fees` text NOT NULL,
	`sequence` integer NOT NULL,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
