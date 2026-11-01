import { z } from "zod";

export const returnItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const createReturnSchema = z.object({
  saleId: z.string(),
  reason: z.string().optional().default(""),
  items: z.array(returnItemSchema).min(1),
});

export const returnDispositionSchema = z.object({
  action: z.enum(["restock", "dispose"]),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
