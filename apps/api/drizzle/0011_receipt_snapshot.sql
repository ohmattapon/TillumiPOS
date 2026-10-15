ALTER TABLE "sales" ADD COLUMN "shop_name" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shop_tax_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "branch_name" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shop_address" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shop_phone" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "receipt_paper_mm" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "receipt_footer" text;