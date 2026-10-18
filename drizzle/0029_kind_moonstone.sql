ALTER TABLE "shop_settings" ADD COLUMN "promptpay_mode" text DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "promptpay_target" text;