CREATE TABLE "modifier_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modifier_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modifier_groups_name_unique" UNIQUE("name"),
	CONSTRAINT "modifier_groups_max_selections" CHECK ("modifier_groups"."max_selections" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modifier_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_satang" integer DEFAULT 0 NOT NULL,
	"cost_satang" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modifier_options_groupId_name_unique" UNIQUE("group_id","name"),
	CONSTRAINT "modifier_options_non_negative" CHECK ("modifier_options"."price_satang" >= 0 and "modifier_options"."cost_satang" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_modifier_groups" (
	"product_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_modifier_groups_product_id_group_id_pk" PRIMARY KEY("product_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_productId_unique";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "options_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modifier_options_group_id_index" ON "modifier_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "product_modifier_groups_group_id_index" ON "product_modifier_groups" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_productId_optionsKey_unique" UNIQUE("order_id","product_id","options_key");