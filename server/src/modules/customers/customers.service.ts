import { prisma } from "../../services/prisma";
import { NotFoundError, BadRequestError } from "../../utils/errors";
import { cacheGet, cacheSet, cacheDelNamespace, makeKey } from "../../utils/cache";
import type { CreateCustomerInput } from "./customers.schema";
import { Prisma } from "../../generated/prisma/client";

interface CustomerStats {
  total_purchases: number;
  outstanding_arrear: number;
  last_purchase: string | null;
}

const customerStatsSelect = `
  (SELECT COUNT(*)::int FROM sales s WHERE s.customer_id = c.id) AS total_purchases,
  COALESCE((SELECT SUM(a.balance_due) FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending'), 0) AS outstanding_arrear,
  (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id) AS last_purchase`;

export const customersService = {
  async list({
    page = 1,
    limit = 100000,
    search,
    includeArchived = false,
    archivedOnly = false,
    sortBy,
    sortOrder = "desc",
  }: {
    page?: number;
    limit?: number;
    search?: string;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const cacheKey = makeKey("customers:list", {
      page, limit, search, includeArchived, archivedOnly, sortBy, sortOrder,
    });
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (archivedOnly) {
      conditions.push("c.active = 0");
    } else if (!includeArchived) {
      conditions.push("c.active = 1");
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(
        `(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.father_name ILIKE $${params.length} OR c.father_phone ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*)::int as total FROM customers c ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params);
    const total = Number(countResult[0]?.total || 0);

    const dir = sortOrder === "asc" ? "ASC" : "DESC";
    let orderSql = `ORDER BY c.created_at DESC`;
    if (sortBy === "name") {
      orderSql = `ORDER BY c.name ${dir}`;
    } else if (sortBy === "created_at" || sortBy === "createdAt") {
      orderSql = `ORDER BY c.created_at ${dir}`;
    }

    const dataQuery = `
      SELECT c.id, c.name, c.phone, c.address, c.father_name, c.father_phone, c.active, c.created_at,
        ${customerStatsSelect}
      FROM customers c
      ${whereClause}
      ${orderSql}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const data = await prisma.$queryRawUnsafe<unknown[]>(dataQuery, ...params, limit, skip);

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    cacheSet(cacheKey, result, 120); // cache customer list for 120 seconds
    return result;
  },

  async getById(id: string) {
    const cacheKey = makeKey("customers:id", { id });
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { createdAt: "desc" },
          include: { items: true },
        },
        arrears: {
          orderBy: { createdAt: "desc" },
          include: { payments: { orderBy: { createdAt: "asc" } } },
        },
      },
    });
    if (!customer) throw new NotFoundError("Customer");

    const [stats] = await prisma.$queryRawUnsafe<CustomerStats[]>(
      `SELECT
        ${customerStatsSelect}
       FROM customers c
       WHERE c.id = $1
       GROUP BY c.id`,
      id
    );

    const result = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      father_name: customer.fatherName,
      father_phone: customer.fatherPhone,
      created_at: customer.createdAt.toISOString(),
      total_purchases: stats?.total_purchases ?? 0,
      outstanding_arrear: stats?.outstanding_arrear ?? 0,
      last_purchase: stats?.last_purchase ?? null,
      purchases: customer.sales.map((s) => ({
        id: s.id,
        customer_id: s.customerId ?? undefined,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        amount_paid: s.amountPaid,
        change: s.change,
        status: s.status,
        created_at: s.createdAt.toISOString(),
        items: s.items.map((i) => ({
          id: i.id,
          sale_id: i.saleId,
          product_id: i.productId,
          product_name: i.productName,
          barcode: i.barcode,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          subtotal: i.subtotal,
        })),
      })),
      arrears: customer.arrears.map((a) => ({
        id: a.id,
        sale_id: a.saleId ?? "",
        customer_id: a.customerId,
        total_bill: a.totalBill,
        amount_paid: a.amountPaid,
        balance_due: a.balanceDue,
        status: a.status,
        created_at: a.createdAt.toISOString(),
        payments: a.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          payment_sale_id: p.paymentSaleId ?? null,
          created_at: p.createdAt.toISOString(),
        })),
      })),
    };

    cacheSet(cacheKey, result, 120); // cache customer detail for 120 seconds
    return result;
  },

  async create(data: CreateCustomerInput) {
    const result = await prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone ?? "",
        address: data.address ?? "",
        fatherName: data.fatherName ?? "",
        fatherPhone: data.fatherPhone ?? "",
      },
    });
    cacheDelNamespace("customers"); // invalidate customer cache on write
    return result;
  },

  async update(id: string, data: CreateCustomerInput) {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Customer");

    const result = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone ?? "",
        address: data.address ?? "",
        fatherName: data.fatherName ?? "",
        fatherPhone: data.fatherPhone ?? "",
      },
    });
    cacheDelNamespace("customers"); // invalidate customer cache on write
    return result;
  },

  async archive(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError("Customer");

    // Check for pending arrears / outstanding balance
    const pendingArrears = await prisma.arrear.findMany({
      where: {
        customerId: id,
        status: { not: "paid" },
        balanceDue: { gt: 0 },
      },
    });

    const totalOutstanding = pendingArrears.reduce((sum, a) => sum + (a.balanceDue || 0), 0);
    if (totalOutstanding > 0) {
      throw new BadRequestError(
        `Cannot archive customer: Customer has pending arrears of Rs. ${totalOutstanding.toFixed(0)}. Outstanding balance must be settled before archiving.`
      );
    }

    const result = await prisma.customer.update({
      where: { id },
      data: { active: 0 },
    });
    cacheDelNamespace("customers"); // invalidate customer cache on write
    return result;
  },

  async restore(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError("Customer");
    const result = await prisma.customer.update({
      where: { id },
      data: { active: 1 },
    });
    cacheDelNamespace("customers"); // invalidate customer cache on write
    return result;
  },

  async hardDelete(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError("Customer");

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sale.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.arrear.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
      return { success: true };
    });
    cacheDelNamespace("customers"); // invalidate customer cache on write
    return result;
  },

  async delete(id: string) {
    return this.archive(id);
  },
};
