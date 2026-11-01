ALTER TABLE "product_batches"
ALTER COLUMN "expiry_date" DROP NOT NULL;

ALTER TABLE "sales"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'sale';

UPDATE "sales" AS s
SET "kind" = 'arrear_payment'
WHERE EXISTS (
  SELECT 1
  FROM "arrear_payments" AS ap
  WHERE ap."payment_sale_id" = s."id"
);

CREATE INDEX "sales_kind_created_at_idx" ON "sales"("kind", "created_at");

ALTER TABLE "sale_items"
ADD COLUMN "purchase_price" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "sale_items" AS si
SET "purchase_price" = p."purchase_price"
FROM "products" AS p
WHERE p."id" = si."product_id";

UPDATE "sale_items" AS si
SET "purchase_price" = b."purchase_price"
FROM "product_batches" AS b
WHERE b."id" = si."batch_id";

ALTER TABLE "returns"
ADD COLUMN "credit_applied" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "cash_refunded" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "return_items"
ADD COLUMN "inventory_status" TEXT NOT NULL DEFAULT 'restocked',
ADD COLUMN "batch_id" TEXT,
ADD COLUMN "purchase_price" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "return_items"
ALTER COLUMN "inventory_status" SET DEFAULT 'quarantined';

ALTER TABLE "return_items"
ADD CONSTRAINT "return_items_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "return_items_batch_id_idx" ON "return_items"("batch_id");
