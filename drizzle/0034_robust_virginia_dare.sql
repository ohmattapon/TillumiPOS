CREATE TABLE "product_packs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_packs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"barcode" text NOT NULL,
	"size" integer NOT NULL,
	"price_satang" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_packs_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "product_packs_size_range" CHECK ("product_packs"."size" between 2 and 9999),
	CONSTRAINT "product_packs_price_non_negative" CHECK ("product_packs"."price_satang" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "pack_id" integer;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "pack_size" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_packs_product_id_index" ON "product_packs" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_pack_id_product_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."product_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_pack_size_positive" CHECK ("sale_items"."pack_size" >= 1);