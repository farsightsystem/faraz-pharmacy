import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  barcode: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  batchId: z.string().optional(),
  batchNumber: z.string().optional(),
  expiry: z.string().optional(),
});

export const createSaleSchema = z.object({
  customerId: z.string().optional(),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0).optional(),
  total: z.number().nonnegative(),
  amountPaid: z.number().nonnegative(),
  items: z.array(saleItemSchema).min(1),
}).superRefine((sale, ctx) => {
  const calculatedSubtotal = sale.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const expectedTotal = calculatedSubtotal - sale.discount + (sale.tax ?? 0);

  if (sale.discount > calculatedSubtotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount"],
      message: "Discount cannot exceed the item subtotal",
    });
  }
  if (Math.abs(sale.subtotal - calculatedSubtotal) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subtotal"],
      message: "Subtotal does not match the sale items",
    });
  }
  if (Math.abs(sale.total - expectedTotal) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total"],
      message: "Total does not match subtotal, discount, and tax",
    });
  }
  if (sale.amountPaid < expectedTotal && !sale.customerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customerId"],
      message: "A customer is required when the sale has an unpaid balance",
    });
  }
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
