CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`checks_done` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_owner_updated` ON `records` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`invite_hash` text NOT NULL,
	`host_hash` text NOT NULL,
	`guest_hash` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`host_seen` integer DEFAULT 0 NOT NULL,
	`guest_seen` integer DEFAULT 0 NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_owner_created` ON `rooms` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`sender` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signals_room_cursor` ON `signals` (`room_code`,`id`);