ALTER TABLE "shop_settings" ADD COLUMN "receipt_printer_ip" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "receipt_printer_port" integer DEFAULT 9100 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "receipt_printer_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "cash_drawer_enabled" boolean DEFAULT false NOT NULL;
