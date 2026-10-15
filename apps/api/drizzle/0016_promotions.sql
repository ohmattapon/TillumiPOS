CREATE TYPE "public"."promotion_audience" AS ENUM('everyone', 'members');--> statement-breakpoint
CREATE TYPE "public"."promotion_kind" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('open', 'reserved', 'consumed', 'cancelled');--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promotions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" "promotion_kind" NOT NULL,
	"value" integer NOT NULL,
	"max_discount_satang" integer,
	"min_subtotal_satang" integer DEFAULT 0 NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"weekdays" integer[],
	"window_start_minute" integer,
	"window_end_minute" integer,
	"audience" "promotion_audience" DEFAULT 'everyone' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_value_positive" CHECK ("promotions"."value" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_quotes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_quotes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"member_id" integer,
	"member" jsonb,
	"order_id" integer,
	"lines" jsonb NOT NULL,
	"promotion" jsonb,
	"subtotal_satang" integer NOT NULL,
	"discount_satang" integer DEFAULT 0 NOT NULL,
	"vat_mode" "vat_mode" NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"vat_satang" integer NOT NULL,
	"total_satang" integer NOT NULL,
	"status" "quote_status" DEFAULT 'open' NOT NULL,
	"qr_reference" text,
	"sale_id" integer,
	"created_by_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "promotion_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "promotion" jsonb;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_name_lower_unique" ON "promotions" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "promotions_is_active_idx" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "price_quotes_qr_reference_unique" ON "price_quotes" USING btree ("qr_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "price_quotes_sale_id_unique" ON "price_quotes" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "price_quotes_order_status_idx" ON "price_quotes" USING btree ("order_id","status");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;