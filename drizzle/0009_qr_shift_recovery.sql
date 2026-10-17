CREATE TYPE "public"."qr_attempt_state" AS ENUM('creating', 'ready', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "shift_qr_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shift_qr_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"origin_shift_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"reference" text NOT NULL,
	"amount_satang" integer NOT NULL,
	"state" "qr_attempt_state" DEFAULT 'creating' NOT NULL,
	"qr_payment_id" integer,
	"qr_image" text,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_qr_attempts_reference_unique" UNIQUE("reference"),
	CONSTRAINT "shift_qr_attempts_actorId_idempotencyKey_unique" UNIQUE("actor_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "qr_payments" ADD COLUMN "origin_shift_id" integer;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD COLUMN "dismissed_by_id" integer;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD COLUMN "dismiss_reason" text;--> statement-breakpoint
ALTER TABLE "shift_qr_attempts" ADD CONSTRAINT "shift_qr_attempts_origin_shift_id_shifts_id_fk" FOREIGN KEY ("origin_shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_qr_attempts" ADD CONSTRAINT "shift_qr_attempts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_qr_attempts" ADD CONSTRAINT "shift_qr_attempts_qr_payment_id_qr_payments_id_fk" FOREIGN KEY ("qr_payment_id") REFERENCES "public"."qr_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_qr_attempts" ADD CONSTRAINT "shift_qr_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_qr_attempts_origin_shift_id_state_index" ON "shift_qr_attempts" USING btree ("origin_shift_id","state");--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_origin_shift_id_shifts_id_fk" FOREIGN KEY ("origin_shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_dismissed_by_id_users_id_fk" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_payments_origin_shift_id_index" ON "qr_payments" USING btree ("origin_shift_id");