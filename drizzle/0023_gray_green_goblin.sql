-- A checkout may have advanced the ledger past the pre-merge numbering, so this column can already exist
-- when the merged journal reruns here; adding it again must not fail the migrator.
ALTER TABLE "modifier_options" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;
