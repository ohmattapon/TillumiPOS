-- Fail before changing products if another checkout advanced its ledger without the prerequisite.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'modifier_options' AND column_name = 'is_default'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_TYPE_MIGRATION_REQUIRES_MODIFIER_OPTIONS_IS_DEFAULT: restore the missing prerequisite before migrating';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_type" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_type_allowed" CHECK ("products"."product_type" in ('normal', 'cafe'));
--> statement-breakpoint
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
