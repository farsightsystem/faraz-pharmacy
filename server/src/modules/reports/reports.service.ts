import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { Prisma } from "../../generated/prisma/client";

export const reportsService = {
  async getStats() {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfDaysAgo = (daysAgo: number) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo));
    const sevenDaysAgo = startOfDaysAgo(6);
    const thirtyDaysAgo = startOfDaysAgo(29);
    const todayString = today.toISOString().slice(0, 10);
    const expiryThrough = startOfDaysAgo(-30).toISOString().slice(0, 10);

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
        where: { createdAt: { gte: today } },
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
        SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(total), 0)::float AS revenue
        FROM sales
        WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY created_at::date
        ORDER BY created_at::date
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
        const date = startOfDaysAgo(days - index - 1);
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
