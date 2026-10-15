CREATE TYPE "public"."kitchen_ticket_status" AS ENUM('pending', 'done');--> statement-breakpoint
CREATE TYPE "public"."shop_home_view" AS ENUM('till', 'tables');--> statement-breakpoint
CREATE TABLE "kitchen_category_stations" (
	"category_id" integer PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kitchen_stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_stations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kitchen_ticket_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"options_key" text DEFAULT '' NOT NULL,
	"option_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"quantity" integer NOT NULL,
	"voided_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kitchen_ticket_lines_voided_range" CHECK ("kitchen_ticket_lines"."voided_quantity" >= 0 and "kitchen_ticket_lines"."voided_quantity" <= "kitchen_ticket_lines"."quantity"),
	CONSTRAINT "kitchen_ticket_lines_quantity_positive" CHECK ("kitchen_ticket_lines"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "kitchen_tickets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kitchen_tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"station_id" integer NOT NULL,
	"round_no" integer NOT NULL,
	"status" "kitchen_ticket_status" DEFAULT 'pending' NOT NULL,
	"sent_by_id" integer NOT NULL,
	"done_by_id" integer,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_tickets_orderId_stationId_roundNo_unique" UNIQUE("order_id","station_id","round_no")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "home_view" "shop_home_view" DEFAULT 'till' NOT NULL;--> statement-breakpoint
ALTER TABLE "kitchen_category_stations" ADD CONSTRAINT "kitchen_category_stations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_category_stations" ADD CONSTRAINT "kitchen_category_stations_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_lines" ADD CONSTRAINT "kitchen_ticket_lines_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_lines" ADD CONSTRAINT "kitchen_ticket_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kitchen_ticket_lines_ticket_id_index" ON "kitchen_ticket_lines" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_lines_product_id_options_key_index" ON "kitchen_ticket_lines" USING btree ("product_id","options_key");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_branch_id_station_id_status_index" ON "kitchen_tickets" USING btree ("branch_id","station_id","status");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_order_id_index" ON "kitchen_tickets" USING btree ("order_id");