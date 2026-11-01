import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { Prisma } from "../../generated/prisma/client";

type ReportDateRange = { gte?: Date; lte?: Date };

function getDateRange(
  dateFrom?: string,
  dateTo?: string,
  tzOffsetMinutes = 0
): ReportDateRange | undefined {
  const offsetMs = tzOffsetMinutes * 60_000;
  const range: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    range.gte = new Date(new Date(`${dateFrom}T00:00:00.000Z`).getTime() - offsetMs);
  }
  if (dateTo) {
    range.lte = new Date(new Date(`${dateTo}T23:59:59.999Z`).getTime() - offsetMs);
  }
  return Object.keys(range).length ? range : undefined;
}

export const reportsService = {
  async getStats(tzOffsetMinutes = 0) {
    const offsetMs = tzOffsetMinutes * 60_000;
    const shiftedNow = new Date(Date.now() + offsetMs);
    const todayCalendarDate = new Date(
      Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())
    );
    const startOfDaysAgo = (daysAgo: number) =>
      new Date(
        Date.UTC(
          todayCalendarDate.getUTCFullYear(),
          todayCalendarDate.getUTCMonth(),
          todayCalendarDate.getUTCDate() - daysAgo
        ) - offsetMs
      );
    const sevenDaysAgo = startOfDaysAgo(6);
    const thirtyDaysAgo = startOfDaysAgo(29);
    const tomorrow = new Date(startOfDaysAgo(0).getTime() + 24 * 60 * 60 * 1000);
    const todayString = todayCalendarDate.toISOString().slice(0, 10);
    const expiryThrough = new Date(
      Date.UTC(
        todayCalendarDate.getUTCFullYear(),
        todayCalendarDate.getUTCMonth(),
        todayCalendarDate.getUTCDate() + 30
      )
    ).toISOString().slice(0, 10);

    const [
      todayRevenue,
      totalArrears,
      lowStockCount,
      expiringSoonCount,
      dailyRevenue,
      topProducts,
      lowStockProducts,
      expiringProducts,
      topCustomers,
      pendingArrears,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: { createdAt: { gte: startOfDaysAgo(0), lt: tomorrow } },
        _sum: { total: true },
      }),

      prisma.arrear.aggregate({
        where: { status: "pending" },
        _sum: { balanceDue: true },
      }),

      prisma.product.count({
        where: { active: 1, stockQty: { gt: 0, lte: 10 } },
      }),

      prisma.product.count({
        where: {
          active: 1,
          expiry: { gte: todayString, lte: expiryThrough },
        },
      }),

      prisma.$queryRaw<{ day: string; revenue: number }[]>`
        SELECT TO_CHAR((created_at + (${tzOffsetMinutes} * INTERVAL '1 minute'))::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(total), 0)::float AS revenue
        FROM sales
        WHERE created_at >= ${thirtyDaysAgo}
          AND created_at < ${tomorrow}
        GROUP BY (created_at + (${tzOffsetMinutes} * INTERVAL '1 minute'))::date
        ORDER BY (created_at + (${tzOffsetMinutes} * INTERVAL '1 minute'))::date
      `,

      prisma.saleItem.groupBy({
        by: ["productName"],
        _sum: { subtotal: true },
        orderBy: { _sum: { subtotal: "desc" } },
        take: 5,
      }),

      prisma.product.findMany({
        where: { active: 1, stockQty: { gt: 0, lte: 10 } },
        orderBy: { stockQty: "asc" },
        take: 5,
        select: { id: true, name: true, barcode: true, stockQty: true },
      }),

      prisma.product.findMany({
        where: { active: 1, expiry: { gte: todayString, lte: expiryThrough } },
        orderBy: { expiry: "asc" },
        take: 5,
        select: { id: true, name: true, stockQty: true, expiry: true },
      }),

      prisma.$queryRaw<{ id: string; name: string; phone: string; total_spent: number }[]>`
        SELECT c.id, c.name, c.phone, COALESCE(SUM(s.total), 0)::float AS total_spent
        FROM customers c
        JOIN sales s ON s.customer_id = c.id
        WHERE c.active = 1
        GROUP BY c.id, c.name, c.phone
        ORDER BY SUM(s.total) DESC
        LIMIT 5
      `,

      prisma.arrear.findMany({
        where: { status: "pending", balanceDue: { gt: 0 } },
        orderBy: { balanceDue: "desc" },
        take: 5,
        include: { customer: { select: { name: true } } },
      }),
    ]);

    const revenueByDay = new Map(dailyRevenue.map((row) => [row.day, Number(row.revenue)]));
    const makeRevenueSeries = (days: number) =>
      Array.from({ length: days }, (_, index) => {
        const daysAgo = days - index - 1;
        const date = new Date(
          Date.UTC(
            todayCalendarDate.getUTCFullYear(),
            todayCalendarDate.getUTCMonth(),
            todayCalendarDate.getUTCDate() - daysAgo
          )
        );
        const day = date.toISOString().slice(0, 10);
        return { day, revenue: revenueByDay.get(day) ?? 0 };
      });

    return {
      todayRevenue: todayRevenue._sum.total ?? 0,
      totalArrears: totalArrears._sum.balanceDue ?? 0,
      lowStockCount,
      expiringSoonCount,
      weekRevenue: makeRevenueSeries(7),
      monthRevenue: makeRevenueSeries(30),
      topProducts: topProducts.map((p: Record<string, unknown>) => ({
        name: p.productName as string,
        value: Number((p._sum as Record<string, number>).subtotal ?? 0),
      })),
      lowStockProducts: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        stock_qty: product.stockQty,
      })),
      expiringProducts: expiringProducts.map((product) => ({
        id: product.id,
        name: product.name,
        stock_qty: product.stockQty,
        expiry: product.expiry,
      })),
      topCustomers,
      pendingArrears: pendingArrears.map((arrear) => ({
        id: arrear.id,
        sale_id: arrear.saleId,
        customer_name: arrear.customer.name,
        balance_due: arrear.balanceDue,
      })),
    };
  },

  async getSalesSummary(opts: {
    dateFrom?: string;
    dateTo?: string;
    tzOffsetMinutes?: number;
  }) {
    const createdAt = getDateRange(opts.dateFrom, opts.dateTo, opts.tzOffsetMinutes);
    const where: Prisma.SaleWhereInput = createdAt ? { createdAt } : {};
    const offsetMs = (opts.tzOffsetMinutes ?? 0) * 60_000;
    const shiftedNow = new Date(Date.now() + offsetMs);
    const chartCalendarDate = new Date(
      Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())
    );
    const chartStart = new Date(
      Date.UTC(
        chartCalendarDate.getUTCFullYear(),
        chartCalendarDate.getUTCMonth(),
        chartCalendarDate.getUTCDate() - 29
      ) - offsetMs
    );
    const [aggregate, profitRows, dailyRevenue] = await Promise.all([
      prisma.sale.aggregate({
        where,
        _count: { _all: true },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.$queryRaw<{ cost_of_goods: number; profit: number }[]>`
        SELECT COALESCE(SUM(sale_profit.cost_of_goods), 0)::float AS cost_of_goods,
               COALESCE(SUM(ROUND(
                 sale_profit.gross_profit *
                 (1 - CASE WHEN sale_profit.subtotal > 0
                           THEN sale_profit.discount / sale_profit.subtotal
                           ELSE 0 END)
               )), 0)::float AS profit
        FROM (
          SELECT s.id, s.subtotal, s.discount,
                 SUM(p.purchase_price * si.quantity) AS cost_of_goods,
                 SUM((si.unit_price - p.purchase_price) * si.quantity) AS gross_profit
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          JOIN products p ON p.id = si.product_id
          WHERE (${createdAt?.gte ?? null}::timestamp IS NULL OR s.created_at >= ${createdAt?.gte ?? null})
            AND (${createdAt?.lte ?? null}::timestamp IS NULL OR s.created_at <= ${createdAt?.lte ?? null})
          GROUP BY s.id, s.subtotal, s.discount
        ) sale_profit
      `,
      prisma.$queryRaw<{ day: string; revenue: number }[]>`
        SELECT TO_CHAR((created_at + (${opts.tzOffsetMinutes ?? 0} * INTERVAL '1 minute'))::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(total), 0)::float AS revenue
        FROM sales
        WHERE created_at >= ${chartStart}
        GROUP BY (created_at + (${opts.tzOffsetMinutes ?? 0} * INTERVAL '1 minute'))::date
        ORDER BY (created_at + (${opts.tzOffsetMinutes ?? 0} * INTERVAL '1 minute'))::date
      `,
    ]);

    return {
      revenue: aggregate._sum.total ?? 0,
      transactionCount: aggregate._count._all,
      amountPaid: aggregate._sum.amountPaid ?? 0,
      outstanding: (aggregate._sum.total ?? 0) - (aggregate._sum.amountPaid ?? 0),
      costOfGoods: Number(profitRows[0]?.cost_of_goods ?? 0),
      profit: Number(profitRows[0]?.profit ?? 0),
      dailyRevenue,
    };
  },

  async getPurchaseSummary(opts: { dateFrom?: string; dateTo?: string }) {
    const createdAt = getDateRange(opts.dateFrom, opts.dateTo);
    const where: Prisma.StockPurchaseWhereInput = {
      active: 1,
      ...(createdAt ? { createdAt } : {}),
    };
    const [aggregate, supplierRows] = await Promise.all([
      prisma.stockPurchase.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalValue: true, quantity: true },
      }),
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT distributor_id)::int AS count
        FROM stock_purchases
        WHERE active = 1
          AND (${createdAt?.gte ?? null}::timestamp IS NULL OR created_at >= ${createdAt?.gte ?? null})
          AND (${createdAt?.lte ?? null}::timestamp IS NULL OR created_at <= ${createdAt?.lte ?? null})
      `,
    ]);
    const total = aggregate._sum.totalValue ?? 0;
    const entries = aggregate._count._all;
    return {
      total,
      units: aggregate._sum.quantity ?? 0,
      entries,
      suppliers: supplierRows[0]?.count ?? 0,
      averageEntryCost: entries > 0 ? total / entries : 0,
    };
  },

  async getExpenseSummary(opts: {
    dateFrom?: string;
    dateTo?: string;
    category?: string;
  }) {
    const where: Prisma.ExpenseWhereInput = {
      active: 1,
      ...(opts.dateFrom || opts.dateTo
        ? {
            date: {
              ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
              ...(opts.dateTo ? { lte: opts.dateTo } : {}),
            },
          }
        : {}),
      ...(opts.category
        ? { category: { equals: opts.category, mode: "insensitive" } }
        : {}),
    };
    const [aggregate, categories] = await Promise.all([
      prisma.expense.aggregate({
        where,
        _count: { _all: true },
        _sum: { amount: true },
        _avg: { amount: true },
        _max: { amount: true },
      }),
      prisma.expense.findMany({
        where: {
          active: 1,
          ...(opts.dateFrom || opts.dateTo
            ? {
                date: {
                  ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
                  ...(opts.dateTo ? { lte: opts.dateTo } : {}),
                },
              }
            : {}),
        },
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
    ]);
    return {
      total: aggregate._sum.amount ?? 0,
      entries: aggregate._count._all,
      average: aggregate._avg.amount ?? 0,
      maximum: aggregate._max.amount ?? 0,
      categories: categories.map((expense) => expense.category).filter(Boolean),
    };
  },

  async getProductReport(opts: {
    productId: string;
    dateFrom?: string;
    dateTo?: string;
    tzOffsetMinutes?: number;
  }) {
    const { productId, dateFrom, dateTo, tzOffsetMinutes } = opts;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        company: { select: { name: true } },
        batches: {
          include: { distributor: { select: { name: true } } },
          orderBy: { expiryDate: "asc" },
        },
        stockPurchases: {
          include: { distributor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    const offsetMs = (tzOffsetMinutes ?? 0) * 60000;
    const saleWhere: Prisma.SaleItemWhereInput = {
      productId,
    };

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        createdAt.gte = new Date(new Date(`${dateFrom}T00:00:00.000Z`).getTime() - offsetMs);
      }
      if (dateTo) {
        createdAt.lte = new Date(new Date(`${dateTo}T23:59:59.999Z`).getTime() - offsetMs);
      }
      saleWhere.sale = { is: { createdAt } };
    }

    const saleItems = await prisma.saleItem.findMany({
      where: saleWhere,
      include: {
        sale: {
          select: {
            id: true,
            createdAt: true,
            subtotal: true,
            discount: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { sale: { createdAt: "desc" } },
    });

    let totalUnitsSold = 0;
    let totalRevenue = 0;
    let totalProfit = 0;

    const salesHistory = saleItems.map((item) => {
      totalUnitsSold += item.quantity;
      totalRevenue += item.subtotal;

      const discountRatio =
        item.sale?.subtotal && item.sale.subtotal > 0
          ? item.sale.discount / item.sale.subtotal
          : 0;
      const rawProfit = (item.unitPrice - product.purchasePrice) * item.quantity;
      const adjustedProfit = Math.round(rawProfit * (1 - discountRatio));
      totalProfit += adjustedProfit;

      return {
        id: item.id,
        saleId: item.saleId,
        createdAt: item.sale?.createdAt ? item.sale.createdAt.toISOString() : new Date().toISOString(),
        customerName: item.sale?.customer?.name || "Walk-in",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        discountApplied: Math.round(item.subtotal * discountRatio),
        profit: adjustedProfit,
        batchNumber: item.batchNumber || "—",
        expiry: item.expiry || "—",
      };
    });

    const returnWhere: Prisma.ReturnItemWhereInput = {
      productId,
    };
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        createdAt.gte = new Date(new Date(`${dateFrom}T00:00:00.000Z`).getTime() - offsetMs);
      }
      if (dateTo) {
        createdAt.lte = new Date(new Date(`${dateTo}T23:59:59.999Z`).getTime() - offsetMs);
      }
      returnWhere.returnEntry = { is: { createdAt } };
    }

    const returnItems = await prisma.returnItem.findMany({
      where: returnWhere,
      include: {
        returnEntry: {
          select: {
            id: true,
            createdAt: true,
            saleId: true,
            reason: true,
          },
        },
      },
      orderBy: { returnEntry: { createdAt: "desc" } },
    });

    const totalUnitsReturned = returnItems.reduce((acc, r) => acc + r.quantity, 0);
    const totalRefundAmount = returnItems.reduce((acc, r) => acc + r.refundAmount, 0);

    return {
      product: {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        category: product.category,
        company: product.company,
        location: product.location,
        stockQty: product.stockQty,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        markupPercent: product.markupPercent,
        expiry: product.expiry,
        active: product.active,
      },
      summary: {
        totalUnitsSold,
        totalRevenue,
        totalProfit,
        totalUnitsReturned,
        totalRefundAmount,
        netUnitsSold: Math.max(0, totalUnitsSold - totalUnitsReturned),
        netRevenue: Math.max(0, totalRevenue - totalRefundAmount),
        averageUnitPrice: totalUnitsSold > 0 ? Math.round(totalRevenue / totalUnitsSold) : product.salePrice,
        stockValuation: product.stockQty * product.purchasePrice,
        marginPercent:
          product.purchasePrice > 0
            ? Math.round(((product.salePrice - product.purchasePrice) / product.purchasePrice) * 100)
            : 0,
      },
      salesHistory,
      returnItems: returnItems.map((r) => ({
        id: r.id,
        returnId: r.returnId,
        saleId: r.returnEntry?.saleId,
        createdAt: r.returnEntry?.createdAt ? r.returnEntry.createdAt.toISOString() : new Date().toISOString(),
        quantity: r.quantity,
        refundAmount: r.refundAmount,
        reason: r.returnEntry?.reason || "—",
      })),
      batches: product.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        initialQty: b.initialQty,
        purchasePrice: b.purchasePrice,
        salePrice: b.salePrice,
        distributorName: b.distributor?.name || "—",
        active: b.active,
      })),
      stockPurchases: product.stockPurchases.map((sp) => ({
        id: sp.id,
        invoiceNumber: sp.invoiceNumber || "—",
        createdAt: sp.createdAt ? sp.createdAt.toISOString() : new Date().toISOString(),
        quantity: sp.quantity,
        purchasePrice: sp.purchasePrice,
        batchNumber: sp.batchNumber || "—",
        distributorName: sp.distributor?.name || "—",
      })),
    };
  },
};
