import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { Prisma } from "../../generated/prisma/client";

export const reportsService = {
  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      todayRevenue,
      totalArrears,
      lowStockCount,
      expiringSoonCount,
      weekRevenue,
      monthRevenue,
      topProducts,
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
        where: { stockQty: { lte: 5 } },
      }),

      prisma
        .$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) as count FROM products WHERE expiry IS NOT NULL AND expiry::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`
        )
        .then((r) => Number(r[0]?.count ?? 0)),

      prisma.sale.groupBy({
        by: ["createdAt"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _sum: { total: true },
        orderBy: { createdAt: "asc" },
      }),

      prisma.sale.groupBy({
        by: ["createdAt"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { total: true },
        orderBy: { createdAt: "asc" },
      }),

      prisma.saleItem.groupBy({
        by: ["productName"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

    return {
      todayRevenue: todayRevenue._sum.total ?? 0,
      totalArrears: totalArrears._sum.balanceDue ?? 0,
      lowStockCount,
      expiringSoonCount,
      weekRevenue: weekRevenue.map((r: Record<string, unknown>) => ({
        day: (r.createdAt as Date).toISOString().split("T")[0]!,
        revenue: (r._sum as Record<string, number>).total ?? 0,
      })),
      monthRevenue: monthRevenue.map((r: Record<string, unknown>) => ({
        day: (r.createdAt as Date).toISOString().split("T")[0]!,
        revenue: (r._sum as Record<string, number>).total ?? 0,
      })),
      topProducts: topProducts.map((p: Record<string, unknown>) => ({
        name: p.productName as string,
        value: (p._sum as Record<string, number>).quantity ?? 0,
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
        company: product.company?.name || "",
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
