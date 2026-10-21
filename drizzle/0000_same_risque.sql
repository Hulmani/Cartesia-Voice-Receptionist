CREATE TABLE `appointment_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`patient` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `appointment_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_one_per_slot` ON `appointment_bookings` (`slot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_request_once` ON `appointment_bookings` (`request_id`);--> statement-breakpoint
CREATE TABLE `appointment_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`therapist_id` text NOT NULL,
	`therapist` text NOT NULL,
	`service_id` text NOT NULL,
	`service` text NOT NULL,
	`minutes` integer NOT NULL,
	`price_cad` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slot_resource_time` ON `appointment_slots` (`therapist_id`,`date`,`time`);