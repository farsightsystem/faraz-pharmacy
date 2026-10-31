import { z } from "zod";

export const createStockSchema = z.object({
  productId: z.string(),
  distributorId: z.string().optional(),
  company: z.string().optional(),
  invoiceNumber: z.string().optional().default(""),
  batchNumber: z.string().optional(),
  quantity: z.number().int().positive(),
  stax: z.number().min(0).optional().default(0),
  expiry: z.string().optional(),
  priceTierId: z.string().optional(),
});

export const updateStockSchema = z.object({
  quantity: z.number().int().min(0),
  stax: z.number().min(0).optional(),
  expiry: z.string().optional(),
  batchNumber: z.string().optional(),
  company: z.string().optional(),
  invoiceNumber: z.string().optional(),
  distributorId: z.string().optional(),
  priceTierId: z.string().optional().nullable(),
});

export type CreateStockInput = z.infer<typeof createStockSchema>;
