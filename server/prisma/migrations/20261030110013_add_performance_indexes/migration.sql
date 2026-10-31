-- AlterTable
ALTER TABLE "products" ALTER COLUMN "location" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_location_idx" ON "products"("location");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE INDEX "stock_purchases_product_id_idx" ON "stock_purchases"("product_id");

-- CreateIndex
CREATE INDEX "stock_purchases_invoice_number_idx" ON "stock_purchases"("invoice_number");

-- CreateIndex
CREATE INDEX "stock_purchases_created_at_idx" ON "stock_purchases"("created_at");
