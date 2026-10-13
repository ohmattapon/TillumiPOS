CREATE TABLE "branches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "branches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "branch_stock" (
	"branch_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "branch_stock_branch_id_product_id_pk" PRIMARY KEY("branch_id","product_id")
);
--> statement-breakpoint
-- Everything that exists before branches belongs to one branch, named after the shop.
INSERT INTO "branches" ("code", "name", "address", "phone")
SELECT 'MAIN', coalesce((SELECT "shop_name" FROM "shop_settings" WHERE "id" = 1), 'สาขาหลัก'),
	(SELECT "address" FROM "shop_settings" WHERE "id" = 1), (SELECT "phone" FROM "shop_settings" WHERE "id" = 1);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "branch_id" integer;--> statement-breakpoint
UPDATE "users" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'MAIN');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "branch_id" integer;--> statement-breakpoint
UPDATE "sales" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'MAIN');--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "branch_id" integer;--> statement-breakpoint
UPDATE "stock_movements" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'MAIN');--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD COLUMN "branch_id" integer;--> statement-breakpoint
UPDATE "receipt_counters" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'MAIN');--> statement-breakpoint
ALTER TABLE "receipt_counters" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_counters" DROP CONSTRAINT "receipt_counters_pkey";--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_branch_id_day_pk" PRIMARY KEY("branch_id","day");--> statement-breakpoint
-- The cached balance moves from the product to the branch that held it.
INSERT INTO "branch_stock" ("branch_id", "product_id", "qty")
SELECT (SELECT "id" FROM "branches" WHERE "code" = 'MAIN'), "id", "stock_qty" FROM "products" WHERE "stock_qty" <> 0;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock_qty";--> statement-breakpoint
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP INDEX "stock_movements_product_id_created_at_index";--> statement-breakpoint
CREATE INDEX "stock_movements_branch_id_product_id_created_at_index" ON "stock_movements" USING btree ("branch_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_branch_id_created_at_index" ON "sales" USING btree ("branch_id","created_at");
