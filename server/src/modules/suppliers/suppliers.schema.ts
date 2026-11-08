import { z } from "zod";

export const createDistributorSchema = z.object({
  name: z.string().optional().default(""),
  salesmanName: z.string().optional().default(""),
  salesmanContact: z.string().optional().default(""),
  deliveryManName: z.string().optional().default(""),
  deliveryManContact: z.string().optional().default(""),
});

// Update is partial: omitted fields are left unchanged (not overwritten with "")
export const updateDistributorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  salesmanName: z.string().optional(),
  salesmanContact: z.string().optional(),
  deliveryManName: z.string().optional(),
  deliveryManContact: z.string().optional(),
});

export type UpdateDistributorInput = z.infer<typeof updateDistributorSchema>;

export type CreateDistributorInput = z.infer<typeof createDistributorSchema>;
