# Demo product catalog

The demo catalog contains 450 packaged food and drink products listed in Open Food Facts with Thailand as a country tag. Each entry keeps its barcode, available Thai and original product names, brand, quantity, category tags, product page, and image source URL in `apps/api/src/infrastructure/database/demo-product-catalog.json`. A matching 400-pixel JPEG is stored beside the manifest.

Open Food Facts recommends its public image dataset for bulk downloads. That bucket provides raw photos, and the sample showed that some are side or back-of-package shots rather than the selected front image. Since the POS needs recognizable shelf thumbnails, this demo uses the selected 400-pixel front images and downloads them one at a time from the official image host.

Open Food Facts says its product data is contributed by volunteers and is not guaranteed to be accurate or complete. Names, barcodes, and packaging may change. The demo selling prices, costs, and starting stock in TillumiPOS are generated for demonstration and are not taken from Open Food Facts or a retailer.

## Attribution and licenses

Open Food Facts makes its database available under the Open Database License (ODbL); individual database contents are under the Database Contents License. Product photos are under the Creative Commons Attribution-ShareAlike (CC BY-SA) license. The manifest preserves a product-page URL and source image URLs for each record so the source can be identified. The bundled image files are unchanged copies of Open Food Facts' 400-pixel images.

Keep this notice and the per-record source links when redistributing the demo catalog. If an image is modified, distribute that adaptation under the same CC BY-SA terms. Open Food Facts also notes that packaging can contain marks or artwork subject to other rights.

Official references:

- [Open Food Facts API and reuse terms](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Open Food Facts license guidance](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/)
- [How to download product images](https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/)

## Import the catalog

The importer writes product and category records, opening-stock movements, and image objects. Point `DATABASE_URL` at the development database you intend to populate and verify the target before running; do not use a production database.

1. Start PostgreSQL and apply migrations.
2. Create an owner account and make sure its branch is active.
3. Start the local API and media worker with `bun run dev` so the worker is available at the configured `MEDIA_URL`.
4. In another terminal, run `bun run db:seed:catalog` from the repository root.

The importer adds the products to the active owner's branch. It is safe to rerun: it uses `OFF-<barcode>` SKUs, leaves existing product fields and existing images alone, fills in a missing catalog image, and adds starting stock only if the product has no stock row in that branch. Each image is sent through the API's configured media worker and is stored using the same path as uploaded product photos.
