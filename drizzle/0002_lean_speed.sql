CREATE TABLE `preferences` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`budget_min` integer,
	`budget_max` integer,
	`catering` text NOT NULL,
	`resident_type` text NOT NULL,
	`social` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`residence_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_residence_id_user_id_unique` ON `reviews` (`residence_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `room_interest` (
	`user_id` integer NOT NULL,
	`room_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `room_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `residence_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
-- drizzle-kit generated this step as a copy-and-rename (the usual SQLite
-- "add a column" dance), but the old `shortlist` table has no `user_id` at
-- all — it was last session's shared, anonymous shortlist. There's no user
-- to attribute those rows to, so this drops them outright rather than
-- inventing an owner; see README.md for why that's the honest call here.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `shortlist`;--> statement-breakpoint
CREATE TABLE `shortlist` (
	`user_id` integer NOT NULL,
	`residence_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `residence_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`residence_id`) REFERENCES `residences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;