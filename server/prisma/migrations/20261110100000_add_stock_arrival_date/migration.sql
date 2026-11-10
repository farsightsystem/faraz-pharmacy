-- Add arrival_date to stock_purchases (same TEXT format as expiry)
ALTER TABLE "stock_purchases" ADD COLUMN "arrival_date" TEXT;

-- Add updated_at so the Stock page can sort "Updated first"
ALTER TABLE "stock_purchases" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Indexes for the Stock page sorts
CREATE INDEX "stock_purchases_arrival_date_idx" ON "stock_purchases"("arrival_date");
CREATE INDEX "stock_purchases_updated_at_idx" ON "stock_purchases"("updated_at");
