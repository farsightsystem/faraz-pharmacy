import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { logger } from "../utils/logger";

const connectionString = `${process.env.DATABASE_URL}`;

const poolMax = Number(process.env.PG_POOL_MAX || 20);

const adapter = new PrismaPg(
  {
    connectionString,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "faraz-pharmacy-server",
  },
  {
    onPoolError: (err) => logger.error("PostgreSQL pool error:", err),
    onConnectionError: (err) => logger.error("PostgreSQL connection error:", err),
  }
);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma };
