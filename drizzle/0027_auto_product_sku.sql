-- The original SKU branch applied 0023 at timestamp 1792328900000 before main's
-- cafe migrations were merged. Such a ledger skips 0023-0026 from main. Reuse
-- their idempotent repairs before installing the renumbered SKU migration, and
-- preserve any existing counter rather than restarting or replacing it.
-- Another checkout may have advanced the migration ledger past 0020 without adding this column.
-- Preserve existing selections when 0020 did run, and give older options the original false default.
ALTER TABLE "modifier_options" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;

--> statement-breakpoint
-- A different checkout on the same server advanced the migration ledger past 0025, so the migrator
-- skipped drizzle/0025_product_type.sql there and products.product_type is missing. Repair it here, in
-- one block that is safe to run repeatedly and on a database where 0025 already applied: the column is
-- added only when missing, the allowed-values check only when absent, and the audited starter backfill
-- runs only for a column this repair just created, so a classification changed afterwards survives.
DO $$
DECLARE
  added_column boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_type'
  ) INTO added_column;

  IF added_column THEN
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" text DEFAULT 'normal' NOT NULL;
  END IF;

  -- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the catalog decides whether the check is absent.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass AND conname = 'products_product_type_allowed'
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_product_type_allowed" CHECK ("products"."product_type" in ('normal', 'cafe'));
  END IF;

  IF added_column THEN
    -- Frozen starter SKU snapshot: a matching current SKU alone is not evidence of starter creation.
    UPDATE "products" AS p
    SET "product_type" = 'cafe'
    WHERE p."sku" IN (
      'CAFE-ESP-HOT', 'CAFE-AME-HOT', 'CAFE-AME-ICE', 'CAFE-LAT-HOT', 'CAFE-LAT-ICE',
      'CAFE-CAP-HOT', 'CAFE-CAP-ICE', 'CAFE-MOC-HOT', 'CAFE-MOC-ICE', 'CAFE-CAM-HOT',
      'CAFE-CAM-ICE', 'CAFE-TEA-HOT', 'CAFE-TEA-ICE', 'CAFE-GRN-HOT', 'CAFE-GRN-ICE',
      'CAFE-LEM-ICE', 'CAFE-MAT-HOT', 'CAFE-MAT-ICE', 'CAFE-COC-HOT', 'CAFE-COC-ICE'
    )
    AND EXISTS (
      SELECT 1 FROM "audit_logs" AS a
      WHERE a."action" = 'cafe_menu.applied'
        AND jsonb_typeof(a."after" -> 'addedProducts') = 'array'
        AND (a."after" -> 'addedProducts') @> jsonb_build_array(p."sku")
    );
  END IF;
END $$;

--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."product_sku_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
