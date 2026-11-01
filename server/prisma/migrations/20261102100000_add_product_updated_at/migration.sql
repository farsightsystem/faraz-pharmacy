ALTER TABLE "products"
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "products_updated_at_idx" ON "products"("updated_at");
