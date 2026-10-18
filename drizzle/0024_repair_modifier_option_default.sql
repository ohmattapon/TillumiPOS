-- Another checkout may have advanced the migration ledger past 0020 without adding this column.
-- Preserve existing selections when 0020 did run, and give older options the original false default.
ALTER TABLE "modifier_options" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;
