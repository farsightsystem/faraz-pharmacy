import { prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../utils/errors";
import { Prisma } from "../../generated/prisma/client";
import { authService } from "../auth/auth.service";

function generateSaleId(prefix: string, lastId: string | null) {
  let nextNum = 1;
  if (lastId) {
    nextNum = parseInt(lastId.slice(-6), 10) + 1;
  }
  return `${prefix}${nextNum.toString().padStart(6, "0")}`;
}

function makeSalePrefix(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${yy}${mm}-`;
}

export const arrearsService = {
  async list({ status, page = 1, limit = 100000, search, dateFrom, dateTo, sortBy, sortOrder }: { status?: string; page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortOrder?: "asc" | "desc" } = {}) {
    const where: Prisma.ArrearWhereInput = status && status !== "all" ? { status } : {};

    if (search) {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.ArrearOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "customerName" || sortBy === "name") {
      orderBy = { customer: { name: sortOrder || "asc" } };
    } else if (sortBy === "totalBill" || sortBy === "total_bill") {
      orderBy = { totalBill: sortOrder || "desc" };
    } else if (sortBy === "balanceDue" || sortBy === "balance_due") {
      orderBy = { balanceDue: sortOrder || "desc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.arrear.count({ where }),
      prisma.arrear.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          customer: { select: { name: true } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async create(data: {
    customerId: string;
    totalBill: number;
    amountPaid?: number;
    saleId?: string;
  }) {
    const amountPaid = data.amountPaid ?? 0;
    if (amountPaid < 0 || amountPaid > data.totalBill) {
      throw new BadRequestError("Amount paid cannot exceed total bill");
    }
    const balanceDue = data.totalBill - amountPaid;
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const arrear = await tx.arrear.create({
        data: {
          saleId: data.saleId ?? null,
          customerId: data.customerId,
          totalBill: data.totalBill,
          amountPaid,
          balanceDue: Math.max(0, balanceDue),
          status: balanceDue <= 0 ? "settled" : "pending",
        },
        include: { customer: { select: { name: true } } },
      });

      if (amountPaid > 0) {
        await tx.arrearPayment.create({
          data: { arrearId: arrear.id, amount: amountPaid },
        });
      }

      return tx.arrear.findUniqueOrThrow({
        where: { id: arrear.id },
        include: {
          customer: { select: { name: true } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      });
    });
  },

  async recordPayment(id: string, amount: number, password: string) {
    const { valid } = await authService.verifyPassword(password);
    if (!valid) throw new UnauthorizedError("Invalid admin password");

    const arrear = await prisma.arrear.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    });
    if (!arrear) throw new NotFoundError("Arrear");

    if (amount > arrear.balanceDue) {
      throw new BadRequestError(`Payment cannot exceed the balance due of ${arrear.balanceDue}`);
    }

    const newPaid = arrear.amountPaid + amount;
    const newBalance = Math.max(0, arrear.totalBill - newPaid);
    const newStatus = newBalance <= 0 ? "settled" : "pending";

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.arrear.update({
        where: { id },
        data: { amountPaid: newPaid, balanceDue: newBalance, status: newStatus },
        include: { customer: { select: { name: true } } },
      });

      if (arrear.saleId) {
        await tx.sale.update({ where: { id: arrear.saleId }, data: { status: "paid" } });
      }

      const prefix = makeSalePrefix();
      const last = await tx.sale.findFirst({
        where: { id: { startsWith: prefix } },
        orderBy: { id: "desc" },
      });
      const saleId = generateSaleId(prefix, last?.id ?? null);

      const paymentSale = await tx.sale.create({
        data: {
          id: saleId,
          customerId: arrear.customerId,
          subtotal: amount,
          discount: 0,
          total: amount,
          amountPaid: amount,
          change: 0,
          status: "paid",
        },
      });

      await tx.arrearPayment.create({
        data: { arrearId: arrear.id, amount, paymentSaleId: paymentSale.id },
      });

      const withPayments = await tx.arrear.findUniqueOrThrow({
        where: { id },
        include: {
          customer: { select: { name: true } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      });

      return { arrear: withPayments, paymentSaleId: paymentSale.id };
    });
  },

  async settle(id: string, password: string) {
    const { valid } = await authService.verifyPassword(password);
    if (!valid) throw new UnauthorizedError("Invalid admin password");

    const arrear = await prisma.arrear.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    });
    if (!arrear) throw new NotFoundError("Arrear");

    const settleAmount = arrear.balanceDue;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.arrear.update({
        where: { id },
        data: { amountPaid: arrear.totalBill, balanceDue: 0, status: "settled" },
        include: { customer: { select: { name: true } } },
      });

      if (arrear.saleId) {
        await tx.sale.update({ where: { id: arrear.saleId }, data: { status: "paid" } });
      }

      const prefix = makeSalePrefix();
      const last = await tx.sale.findFirst({
        where: { id: { startsWith: prefix } },
        orderBy: { id: "desc" },
      });
      const saleId = generateSaleId(prefix, last?.id ?? null);

      const paymentSale = await tx.sale.create({
        data: {
          id: saleId,
          customerId: arrear.customerId,
          subtotal: settleAmount,
          discount: 0,
          total: settleAmount,
          amountPaid: settleAmount,
          change: 0,
          status: "paid",
        },
      });

      if (settleAmount > 0) {
        await tx.arrearPayment.create({
          data: { arrearId: arrear.id, amount: settleAmount, paymentSaleId: paymentSale.id },
        });
      }

      const withPayments = await tx.arrear.findUniqueOrThrow({
        where: { id },
        include: {
          customer: { select: { name: true } },
          payments: { orderBy: { createdAt: "asc" } },
        },
      });

      return { arrear: withPayments, paymentSaleId: paymentSale.id };
    });
  },

  async delete(id: string) {
    const arrear = await prisma.arrear.findUnique({ where: { id } });
    if (!arrear) throw new NotFoundError("Arrear");
    await prisma.arrear.delete({ where: { id } });
    return { success: true };
  },

  async listByCustomer({
    status,
    page = 1,
    limit = 50,
    search,
    sortBy,
    sortOrder = "desc",
  }: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const skip = (page - 1) * limit;
    const conditions: string[] = ["EXISTS (SELECT 1 FROM arrears a WHERE a.customer_id = c.id)"];
    const params: any[] = [];

    if (status === "pending") {
      conditions.push("EXISTS (SELECT 1 FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending')");
    } else if (status === "settled") {
      conditions.push("NOT EXISTS (SELECT 1 FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending')");
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.father_name ILIKE $${params.length} OR c.father_phone ILIKE $${params.length})`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countQuery = `SELECT COUNT(*)::int as total FROM customers c ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params);
    const total = Number(countResult[0]?.total || 0);

    const dir = sortOrder === "asc" ? "ASC" : "DESC";
    let orderSql = "ORDER BY latest_date DESC, balance_due DESC";
    if (sortBy === "customer_name" || sortBy === "name") {
      orderSql = `ORDER BY c.name ${dir}`;
    } else if (sortBy === "balance_due" || sortBy === "balanceDue") {
      orderSql = `ORDER BY balance_due ${dir}, latest_date DESC`;
    } else if (sortBy === "total_bill" || sortBy === "totalBill") {
      orderSql = `ORDER BY total_bill ${dir}`;
    } else if (sortBy === "latest_date" || sortBy === "createdAt" || sortBy === "created_at") {
      orderSql = `ORDER BY latest_date ${dir}`;
    }

    const dataQuery = `
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.phone,
        c.father_name,
        c.father_phone,
        c.address,
        COALESCE((SELECT SUM(a.total_bill) FROM arrears a WHERE a.customer_id = c.id), 0)::float AS total_bill,
        COALESCE((SELECT SUM(a.amount_paid) FROM arrears a WHERE a.customer_id = c.id), 0)::float AS amount_paid,
        COALESCE((SELECT SUM(a.balance_due) FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending'), 0)::float AS balance_due,
        COALESCE((SELECT COUNT(*)::int FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending'), 0) AS pending_invoices,
        COALESCE((SELECT COUNT(*)::int FROM arrears a WHERE a.customer_id = c.id), 0) AS total_invoices,
        (SELECT MAX(a.created_at) FROM arrears a WHERE a.customer_id = c.id) AS latest_date,
        CASE
          WHEN EXISTS (SELECT 1 FROM arrears a WHERE a.customer_id = c.id AND a.status = 'pending') THEN 'pending'
          ELSE 'settled'
        END AS status
      FROM customers c
      ${whereClause}
      ${orderSql}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const data = await prisma.$queryRawUnsafe<any[]>(dataQuery, ...params, limit, skip);

    return {
      data: data.map((row) => ({
        ...row,
        total_bill: Number(row.total_bill) || 0,
        amount_paid: Number(row.amount_paid) || 0,
        balance_due: Number(row.balance_due) || 0,
        pending_invoices: Number(row.pending_invoices) || 0,
        total_invoices: Number(row.total_invoices) || 0,
        latest_date: row.latest_date ? new Date(row.latest_date).toISOString() : null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getCustomerLedger(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundError("Customer");

    const arrears = await prisma.arrear.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        sale: {
          include: {
            items: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const totalBill = arrears.reduce((s, a) => s + a.totalBill, 0);
    const amountPaid = arrears.reduce((s, a) => s + a.amountPaid, 0);
    const balanceDue = arrears.filter((a) => a.status === "pending").reduce((s, a) => s + a.balanceDue, 0);
    const pendingInvoices = arrears.filter((a) => a.status === "pending").length;

    const allPayments = arrears.flatMap((a) =>
      a.payments.map((p) => ({
        id: p.id,
        arrear_id: a.id,
        invoice_number: a.saleId || a.id,
        amount: p.amount,
        payment_sale_id: p.paymentSaleId,
        created_at: p.createdAt.toISOString(),
      }))
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        father_name: customer.fatherName,
        father_phone: customer.fatherPhone,
        address: customer.address,
      },
      stats: {
        total_bill: totalBill,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        pending_invoices: pendingInvoices,
        total_invoices: arrears.length,
      },
      arrears: arrears.map((a) => ({
        id: a.id,
        sale_id: a.saleId,
        total_bill: a.totalBill,
        amount_paid: a.amountPaid,
        balance_due: a.balanceDue,
        status: a.status,
        created_at: a.createdAt.toISOString(),
        sale: a.sale
          ? {
              id: a.sale.id,
              subtotal: a.sale.subtotal,
              discount: a.sale.discount,
              total: a.sale.total,
              amount_paid: a.sale.amountPaid,
              created_at: a.sale.createdAt.toISOString(),
              items: a.sale.items.map((item) => ({
                id: item.id,
                product_id: item.productId,
                product_name: item.productName,
                barcode: item.barcode,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                subtotal: item.subtotal,
              })),
            }
          : null,
        payments: a.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          payment_sale_id: p.paymentSaleId,
          created_at: p.createdAt.toISOString(),
        })),
      })),
      payments: allPayments,
    };
  },

  async recordCustomerPayment(customerId: string, amount: number, password: string) {
    const { valid } = await authService.verifyPassword(password);
    if (!valid) throw new UnauthorizedError("Invalid admin password");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundError("Customer");

    if (amount <= 0) {
      throw new BadRequestError("Payment amount must be greater than 0");
    }

    const pendingArrears = await prisma.arrear.findMany({
      where: { customerId, status: "pending" },
      orderBy: { createdAt: "asc" },
    });

    const totalBalanceDue = pendingArrears.reduce((sum, a) => sum + a.balanceDue, 0);

    if (amount > totalBalanceDue + 0.001) {
      throw new BadRequestError(`Payment cannot exceed total balance due of PKR ${totalBalanceDue}`);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const prefix = makeSalePrefix();
      const last = await tx.sale.findFirst({
        where: { id: { startsWith: prefix } },
        orderBy: { id: "desc" },
      });
      const saleId = generateSaleId(prefix, last?.id ?? null);

      const paymentSale = await tx.sale.create({
        data: {
          id: saleId,
          customerId,
          subtotal: amount,
          discount: 0,
          total: amount,
          amountPaid: amount,
          change: 0,
          status: "paid",
        },
      });

      let remaining = amount;
      const allocated: Array<{ arrearId: string; invoiceId: string | null; amount: number }> = [];

      for (const arrear of pendingArrears) {
        if (remaining <= 0) break;
        const payForThis = Math.min(remaining, arrear.balanceDue);
        const newPaid = arrear.amountPaid + payForThis;
        const newBalance = Math.max(0, arrear.totalBill - newPaid);
        const newStatus = newBalance <= 0 ? "settled" : "pending";

        await tx.arrear.update({
          where: { id: arrear.id },
          data: {
            amountPaid: newPaid,
            balanceDue: newBalance,
            status: newStatus,
          },
        });

        if (arrear.saleId && newStatus === "settled") {
          await tx.sale.update({
            where: { id: arrear.saleId },
            data: { status: "paid" },
          });
        }

        await tx.arrearPayment.create({
          data: {
            arrearId: arrear.id,
            amount: payForThis,
            paymentSaleId: paymentSale.id,
          },
        });

        allocated.push({
          arrearId: arrear.id,
          invoiceId: arrear.saleId,
          amount: payForThis,
        });

        remaining -= payForThis;
      }

      const remainingBalance = Math.max(0, totalBalanceDue - amount);

      return {
        receiptId: paymentSale.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        previousBalance: totalBalanceDue,
        amountPaid: amount,
        remainingBalance,
        createdAt: new Date().toISOString(),
        allocated,
      };
    });
  },
};

