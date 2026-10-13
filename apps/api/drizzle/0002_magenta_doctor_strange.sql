CREATE TYPE "public"."vat_mode" AS ENUM('inclusive', 'exclusive', 'none');--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shop_name" text NOT NULL,
	"tax_id" text,
	"address" text,
	"phone" text,
	"currency" text NOT NULL,
	"vat_mode" "vat_mode" NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"time_zone" text NOT NULL,
	"locale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_settings_single_row" CHECK ("shop_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "vat_mode" "vat_mode" DEFAULT 'inclusive' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "vat_rate_bp" integer DEFAULT 700 NOT NULL;