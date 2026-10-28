ALTER TYPE "public"."promotion_kind" ADD VALUE 'bundle';--> statement-breakpoint
ALTER TABLE "promotions" DROP CONSTRAINT "promotions_value_positive";--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "buy_quantity" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "free_quantity" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "max_uses" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "max_uses_per_member" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_coupon_code_upper_unique" ON "promotions" USING btree (upper("coupon_code"));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_bundle_quantities" CHECK ("promotions"."kind"::text <> 'bundle' OR ("promotions"."buy_quantity" BETWEEN 1 AND 99 AND "promotions"."free_quantity" BETWEEN 1 AND 99));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_positive" CHECK ("promotions"."kind"::text = 'bundle' OR "promotions"."value" > 0);