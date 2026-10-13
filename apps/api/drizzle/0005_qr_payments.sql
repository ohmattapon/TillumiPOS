CREATE TYPE "public"."qr_payment_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "qr_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "qr_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"reference" text NOT NULL,
	"amount_satang" integer NOT NULL,
	"status" "qr_payment_status" DEFAULT 'pending' NOT NULL,
	"qr_raw_data" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"bank_transaction_id" text,
	"payer_name" text,
	"paid_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"sale_id" integer,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "qr_payments_amount_positive" CHECK ("qr_payments"."amount_satang" > 0)
);
--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_payments_branch_id_status_index" ON "qr_payments" USING btree ("branch_id","status");