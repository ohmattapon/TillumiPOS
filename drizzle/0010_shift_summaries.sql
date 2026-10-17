CREATE TABLE "shift_summaries" (
	"shift_id" integer PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;