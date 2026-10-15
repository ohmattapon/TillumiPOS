CREATE TABLE "checkout_mode_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shifts_activated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checkout_mode_state_singleton" CHECK ("checkout_mode_state"."id" = 1)
);
