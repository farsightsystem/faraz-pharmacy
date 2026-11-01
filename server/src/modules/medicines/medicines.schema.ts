import { z } from "zod";

export const priceTierSchema = z.object({
  label: z.string().optional().default("Standard"),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative().optional(),
});

const productSchema = z.object({
  barcode: z.string().min(1),
  name: z.string().min(1),
  company: z.string().optional().default(""),
  category: z.string().optional().default(""),
  location: z.string().optional().default(""),
  distributorId: z.string().optional(),
  salePrice: z.number().nonnegative().optional(),
  purchasePrice: z.number().nonnegative(),
  markupPercent: z.number().nonnegative().optional().default(20),
  stockQty: z.number().int().optional().default(0),
  expiry: z.string().optional(),
  prices: z.array(priceTierSchema).optional(),
});

function validateProductPrices(
  product: {
    purchasePrice: number;
    salePrice?: number;
    markupPercent?: number;
    prices?: { purchasePrice: number; salePrice?: number }[];
  },
  ctx: z.RefinementCtx
) {
  const markupPercent = product.markupPercent ?? 20;
  const resolveSalePrice = (purchasePrice: number, salePrice?: number) =>
    salePrice && salePrice > 0
      ? salePrice
      : Math.max(purchasePrice + 0.01, Math.round(purchasePrice * (1 + markupPercent / 100)));

  if (resolveSalePrice(product.purchasePrice, product.salePrice) <= product.purchasePrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salePrice"],
      message: "Sale price must be greater than purchase price",
    });
  }

  product.prices?.forEach((tier, index) => {
    if (resolveSalePrice(tier.purchasePrice, tier.salePrice) <= tier.purchasePrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prices", index, "salePrice"],
        message: "Tier sale price must be greater than its purchase price",
      });
    }
  });
}

export const createProductSchema = productSchema.superRefine(validateProductPrices);

export const updateProductSchema = productSchema
  .omit({
    stockQty: true,
    expiry: true,
  })
  .superRefine(validateProductPrices);

export type CreateProductInput = z.infer<typeof createProductSchema>;
