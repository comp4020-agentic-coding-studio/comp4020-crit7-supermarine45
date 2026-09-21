CREATE TABLE `nearby_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`residence_id` integer NOT NULL,
	`category` text NOT NULL,
	`name` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`distance_meters` integer NOT NULL,
	`source_id` text,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `residence_features` (
	`residence_id` integer NOT NULL,
	`feature` text NOT NULL,
	PRIMARY KEY(`residence_id`, `feature`),
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `residences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`anu_url` text NOT NULL,
	`apply_url` text,
	`resident_undergrad` integer DEFAULT false NOT NULL,
	`resident_postgrad` integer DEFAULT false NOT NULL,
	`catering_type` text NOT NULL,
	`weekly_rate_from` integer,
	`address` text,
	`latitude` real,
	`longitude` real,
	`capacity` integer,
	`capacity_note` text,
	`blurb` text NOT NULL,
	`accessibility_note` text,
	`fee_note` text,
	`image_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `residences_slug_unique` ON `residences` (`slug`);--> statement-breakpoint
CREATE TABLE `shortlist` (
	`residence_id` integer PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shuttle_stops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shuttle_stops_name_unique` ON `shuttle_stops` (`name`);