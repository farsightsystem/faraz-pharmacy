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
      todayRevenueRows,
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
      prisma.$queryRaw<{ revenue: number }[]>`
        SELECT COALESCE(SUM(
          s.total - COALESCE(
            (SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id),
            0
          )
        ), 0)::float AS revenue
        FROM sales s
        WHERE s.kind = 'sale'
          AND s.created_at >= ${startOfDaysAgo(0)}
          AND s.created_at < ${tomorrow}
          AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
      `,

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
        SELECT TO_CHAR((s.created_at + (${tzOffsetMinutes} * INTERVAL '1 minute'))::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(
                 s.total - COALESCE(
                   (SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id),
                   0
                 )
               ), 0)::float AS revenue
        FROM sales s
        WHERE s.kind = 'sale'
          AND s.created_at >= ${thirtyDaysAgo}
          AND s.created_at < ${tomorrow}
          AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
        GROUP BY 1
        ORDER BY 1
      `,

      prisma.$queryRaw<{ name: string; value: number }[]>`
        SELECT sold.product_name AS name,
               GREATEST(sold.revenue - COALESCE(returned.refunds, 0), 0)::float AS value
        FROM (
          SELECT si.product_name,
                 SUM(si.subtotal * (
                   1 - CASE WHEN s.subtotal > 0 THEN s.discount / s.subtotal ELSE 0 END
                     + CASE WHEN s.subtotal > 0 THEN s.tax / s.subtotal ELSE 0 END
                 )) AS revenue
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.kind = 'sale'
          GROUP BY si.product_name
        ) sold
        LEFT JOIN (
          SELECT ri.product_name, SUM(ri.refund_amount) AS refunds
          FROM return_items ri
          GROUP BY ri.product_name
        ) returned ON returned.product_name = sold.product_name
        ORDER BY value DESC
        LIMIT 5
      `,

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
        SELECT c.id, c.name, c.phone,
               COALESCE(SUM(
                 s.total - COALESCE(
                   (SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id),
                   0
                 )
               ), 0)::float AS total_spent
        FROM customers c
        JOIN sales s ON s.customer_id = c.id
        WHERE c.active = 1
          AND s.kind = 'sale'
          AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
        GROUP BY c.id, c.name, c.phone
        ORDER BY total_spent DESC
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
      todayRevenue: Number(todayRevenueRows[0]?.revenue ?? 0),
      totalArrears: totalArrears._sum.balanceDue ?? 0,
      lowStockCount,
      expiringSoonCount,
      weekRevenue: makeRevenueSeries(7),
      monthRevenue: makeRevenueSeries(30),
      topProducts: topProducts.map((product) => ({
        name: product.name,
        value: Number(product.value),
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
    const where: Prisma.SaleWhereInput = {
      kind: "sale",
      items: { some: {} },
      ...(createdAt ? { createdAt } : {}),
    };
    const returnWhere: Prisma.ReturnEntryWhereInput = {
      sale: { is: { kind: "sale", ...(createdAt ? { createdAt } : {}) } },
    };
    const arrearWhere: Prisma.ArrearWhereInput = createdAt ? { createdAt } : {};
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
    const [
      aggregate,
      profitRows,
      dailyRevenue,
      returnTotals,
      returnProfitRows,
      laterPayments,
      arrearAggregate,
    ] =
      await Promise.all([
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
                 SUM(si.purchase_price * si.quantity) AS cost_of_goods,
                 SUM((si.unit_price - si.purchase_price) * si.quantity) AS gross_profit
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          WHERE s.kind = 'sale'
            AND (${createdAt?.gte ?? null}::timestamp IS NULL OR s.created_at >= ${createdAt?.gte ?? null})
            AND (${createdAt?.lte ?? null}::timestamp IS NULL OR s.created_at <= ${createdAt?.lte ?? null})
          GROUP BY s.id, s.subtotal, s.discount
        ) sale_profit
      `,
      prisma.$queryRaw<{ day: string; revenue: number }[]>`
        SELECT TO_CHAR((s.created_at + (${opts.tzOffsetMinutes ?? 0} * INTERVAL '1 minute'))::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(
                 s.total - COALESCE(
                   (SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id),
                   0
                 )
               ), 0)::float AS revenue
        FROM sales s
        WHERE s.kind = 'sale'
          AND s.created_at >= ${chartStart}
          AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
        GROUP BY 1
        ORDER BY 1
      `,
      prisma.returnEntry.aggregate({
        where: returnWhere,
        _sum: { refundAmount: true },
      }),
      prisma.$queryRaw<{ profit_impact: number }[]>`
        SELECT COALESCE(SUM(
          ri.refund_amount * CASE
            WHEN s.subtotal > 0
              AND (1 - s.discount / s.subtotal + s.tax / s.subtotal) > 0
            THEN (1 - s.discount / s.subtotal)
              / (1 - s.discount / s.subtotal + s.tax / s.subtotal)
            ELSE 1
          END
          - CASE
            WHEN ri.inventory_status = 'restocked'
            THEN ri.purchase_price * ri.quantity
            ELSE 0
          END
        ), 0)::float AS profit_impact
        FROM returns r
        JOIN sales s ON s.id = r.sale_id
        JOIN return_items ri ON ri.return_id = r.id
        WHERE s.kind = 'sale'
          AND (${createdAt?.gte ?? null}::timestamp IS NULL OR s.created_at >= ${createdAt?.gte ?? null})
          AND (${createdAt?.lte ?? null}::timestamp IS NULL OR s.created_at <= ${createdAt?.lte ?? null})
      `,
      prisma.$queryRaw<{ amount: number }[]>`
        SELECT COALESCE(SUM(ap.amount), 0)::float AS amount
        FROM arrear_payments ap
        JOIN sales payment ON payment.id = ap.payment_sale_id
        WHERE payment.kind = 'arrear_payment'
          AND (${createdAt?.gte ?? null}::timestamp IS NULL OR ap.created_at >= ${createdAt?.gte ?? null})
          AND (${createdAt?.lte ?? null}::timestamp IS NULL OR ap.created_at <= ${createdAt?.lte ?? null})
      `,
      prisma.arrear.aggregate({
        where: arrearWhere,
        _sum: { balanceDue: true },
      }),
    ]);

    const cashRefunds = await prisma.returnEntry.aggregate({
      where: opts.dateFrom || opts.dateTo
        ? {
            sale: { is: { kind: "sale" } },
            ...(createdAt ? { createdAt } : {}),
          }
        : { sale: { is: { kind: "sale" } } },
      _sum: { cashRefunded: true },
    });

    return {
      revenue: Math.max(
        0,
        (aggregate._sum.total ?? 0) - (returnTotals._sum.refundAmount ?? 0)
      ),
      transactionCount: aggregate._count._all,
      amountPaid:
        (aggregate._sum.amountPaid ?? 0) +
        Number(laterPayments[0]?.amount ?? 0) -
        (cashRefunds._sum.cashRefunded ?? 0),
      outstanding: arrearAggregate._sum.balanceDue ?? 0,
      costOfGoods: Number(profitRows[0]?.cost_of_goods ?? 0),
      profit:
        Number(profitRows[0]?.profit ?? 0) -
        Number(returnProfitRows[0]?.profit_impact ?? 0),
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
          orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
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
            tax: true,
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
      const discountRatio =
        item.sale?.subtotal && item.sale.subtotal > 0
          ? item.sale.discount / item.sale.subtotal
          : 0;
      const taxRatio =
        item.sale?.subtotal && item.sale.subtotal > 0
          ? item.sale.tax / item.sale.subtotal
          : 0;
      totalRevenue += item.subtotal * (1 - discountRatio + taxRatio);

      const rawProfit = (item.unitPrice - item.purchasePrice) * item.quantity;
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
            sale: {
              select: {
                subtotal: true,
                discount: true,
                tax: true,
              },
            },
          },
        },
      },
      orderBy: { returnEntry: { createdAt: "desc" } },
    });

    const totalUnitsReturned = returnItems.reduce((acc, r) => acc + r.quantity, 0);
    const totalRefundAmount = returnItems.reduce((acc, r) => acc + r.refundAmount, 0);
    const returnProfitImpact = returnItems.reduce((impact, item) => {
      const sale = item.returnEntry?.sale;
      const discountRatio =
        sale && sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
      const taxRatio = sale && sale.subtotal > 0 ? sale.tax / sale.subtotal : 0;
      const refundRatio = 1 - discountRatio + taxRatio;
      const refundExcludingTax =
        refundRatio > 0 ? item.refundAmount * ((1 - discountRatio) / refundRatio) : item.refundAmount;
      const recoveredCost =
        item.inventoryStatus === "restocked" ? item.purchasePrice * item.quantity : 0;
      return impact + refundExcludingTax - recoveredCost;
    }, 0);

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
        totalProfit: Math.round(totalProfit - returnProfitImpact),
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
