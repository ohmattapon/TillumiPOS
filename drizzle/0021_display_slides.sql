CREATE TABLE "display_slides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "display_slides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"image_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "display_slides_image_key_unique" UNIQUE("image_key")
);
--> statement-breakpoint
CREATE INDEX "display_slides_is_active_idx" ON "display_slides" USING btree ("is_active");
