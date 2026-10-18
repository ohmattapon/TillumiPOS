DROP TABLE "kitchen_category_stations" CASCADE;--> statement-breakpoint
DROP TABLE "kitchen_stations" CASCADE;--> statement-breakpoint
DROP TABLE "kitchen_ticket_lines" CASCADE;--> statement-breakpoint
DROP TABLE "kitchen_tickets" CASCADE;--> statement-breakpoint
ALTER TABLE "shop_settings" DROP COLUMN "kitchen_enabled";--> statement-breakpoint
DROP TYPE "public"."kitchen_ticket_status";