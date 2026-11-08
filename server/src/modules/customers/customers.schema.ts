import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  fatherName: z.string().optional().default(""),
  fatherPhone: z.string().optional().default(""),
});

// Update is partial: name required, omitted optional fields left unchanged (not wiped to "")
export const updateCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  fatherName: z.string().optional(),
  fatherPhone: z.string().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
