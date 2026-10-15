ALTER TYPE "public"."order_status" ADD VALUE 'merged';--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dining_tables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"name" text NOT NULL,
	"zone" text,
	"seats" integer DEFAULT 4 NOT NULL,
	"x" integer DEFAULT 20 NOT NULL,
	"y" integer DEFAULT 20 NOT NULL,
	"width" integer DEFAULT 120 NOT NULL,
	"height" integer DEFAULT 80 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_tables_branchId_name_unique" UNIQUE("branch_id","name")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "table_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "merged_into_id" integer;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dining_tables_branch_id_index" ON "dining_tables" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merged_into_id_orders_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_table_id_index" ON "orders" USING btree ("table_id");