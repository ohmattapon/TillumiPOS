CREATE TYPE "public"."point_movement_kind" AS ENUM('earn', 'redeem', 'void_earn', 'void_redeem', 'adjust');--> statement-breakpoint
CREATE TABLE "member_point_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "member_point_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" integer NOT NULL,
	"kind" "point_movement_kind" NOT NULL,
	"points" integer NOT NULL,
	"sale_id" integer,
	"quote_id" integer,
	"reason" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_point_movements_points_nonzero" CHECK ("member_point_movements"."points" <> 0),
	CONSTRAINT "member_point_movements_source" CHECK ("member_point_movements"."kind" = 'adjust' or "member_point_movements"."sale_id" is not null or "member_point_movements"."quote_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "points_earned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "points_discount_satang" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "points_rule" jsonb;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "points_balance_after" integer;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "points_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "points_earn_satang" integer DEFAULT 2500 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "points_redeem_satang" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "points_min_redeem" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "points_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD COLUMN "points_discount_satang" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD COLUMN "points_rule" jsonb;--> statement-breakpoint
ALTER TABLE "member_point_movements" ADD CONSTRAINT "member_point_movements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_point_movements" ADD CONSTRAINT "member_point_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_point_movements" ADD CONSTRAINT "member_point_movements_quote_id_price_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."price_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_point_movements" ADD CONSTRAINT "member_point_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_point_movements_member_idx" ON "member_point_movements" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_point_movements_sale_kind_unique" ON "member_point_movements" USING btree ("sale_id","kind") WHERE "member_point_movements"."sale_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "member_point_movements_quote_kind_unique" ON "member_point_movements" USING btree ("quote_id","kind") WHERE "member_point_movements"."quote_id" is not null;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_points_balance_non_negative" CHECK ("members"."points_balance" >= 0);