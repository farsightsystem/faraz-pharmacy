import type { Prisma } from "../../generated/prisma/client";

export async function nextSaleId(tx: Prisma.TransactionClient): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(479103821)`;

  const now = new Date();
  const prefix = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-`;
  const last = await tx.sale.findFirst({
    where: { id: { startsWith: prefix } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const nextNumber = last ? Number.parseInt(last.id.slice(-6), 10) + 1 : 1;

  return `${prefix}${nextNumber.toString().padStart(6, "0")}`;
}
