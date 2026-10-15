CREATE TYPE "public"."shift_status" AS ENUM('open', 'closing', 'closed');--> statement-breakpoint
CREATE TYPE "public"."shift_cash_entry_kind" AS ENUM('cash_sale', 'cash_in', 'cash_out', 'cash_refund');--> statement-breakpoint
CREATE TABLE "registers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registers_branchId_code_unique" UNIQUE("branch_id","code")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shifts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"branch_id" integer NOT NULL,
	"register_id" integer NOT NULL,
	"status" "shift_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opened_by_id" integer NOT NULL,
	"opened_by_name" text NOT NULL,
	"opening_cash_satang" integer NOT NULL,
	"opening_note" text,
	"currency" text NOT NULL,
	"time_zone" text NOT NULL,
	"closing_revision" integer DEFAULT 0 NOT NULL,
	"closing_started_at" timestamp with time zone,
	"closing_started_by_id" integer,
	"closing_started_by_name" text,
	"closing_expected_cash_satang" integer,
	"closed_at" timestamp with time zone,
	"closed_by_id" integer,
	"closed_by_name" text,
	"counted_cash_satang" integer,
	"cash_difference_satang" integer,
	"difference_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_opening_cash_nonnegative" CHECK ("shifts"."opening_cash_satang" >= 0),
	CONSTRAINT "shifts_closing_revision_nonnegative" CHECK ("shifts"."closing_revision" >= 0),
	CONSTRAINT "shifts_counted_cash_nonnegative" CHECK ("shifts"."counted_cash_satang" IS NULL OR "shifts"."counted_cash_satang" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shift_cash_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shift_cash_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"shift_id" integer NOT NULL,
	"kind" "shift_cash_entry_kind" NOT NULL,
	"amount_satang" integer NOT NULL,
	"sale_id" integer,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_cash_entries_amount_positive" CHECK ("shift_cash_entries"."amount_satang" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shift_id" integer;--> statement-breakpoint
INSERT INTO "registers" ("branch_id", "code", "name") SELECT "id", 'MAIN', 'เคาน์เตอร์หลัก' FROM "branches";--> statement-breakpoint
ALTER TABLE "registers" ADD CONSTRAINT "registers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closing_started_by_id_users_id_fk" FOREIGN KEY ("closing_started_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cash_entries" ADD CONSTRAINT "shift_cash_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cash_entries" ADD CONSTRAINT "shift_cash_entries_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cash_entries" ADD CONSTRAINT "shift_cash_entries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registers_branch_id_is_active_index" ON "registers" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_active_per_register" ON "shifts" USING btree ("register_id") WHERE "shifts"."status" IN ('open', 'closing');--> statement-breakpoint
CREATE INDEX "shifts_branch_id_opened_at_index" ON "shifts" USING btree ("branch_id","opened_at");--> statement-breakpoint
CREATE INDEX "shifts_register_id_status_index" ON "shifts" USING btree ("register_id","status");--> statement-breakpoint
CREATE INDEX "shift_cash_entries_shift_id_created_at_index" ON "shift_cash_entries" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_cash_entries_one_refund_per_sale" ON "shift_cash_entries" USING btree ("sale_id") WHERE "shift_cash_entries"."kind" = 'cash_refund';--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_shift_id_created_at_index" ON "sales" USING btree ("shift_id","created_at");
