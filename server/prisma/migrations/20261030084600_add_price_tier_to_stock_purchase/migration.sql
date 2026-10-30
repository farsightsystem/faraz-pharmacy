-- AlterTable
ALTER TABLE "stock_purchases" ADD COLUMN     "price_tier_id" TEXT;

-- AddForeignKey
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "product_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
