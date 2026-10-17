ALTER TABLE "shop_settings" ADD COLUMN "tables_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "kitchen_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "modifiers_enabled" boolean DEFAULT true NOT NULL;