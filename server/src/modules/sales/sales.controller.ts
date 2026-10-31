import type { Request, Response, NextFunction } from "express";
import { salesService } from "./sales.service";

function normalizeSale(s: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!s) return null;
  const items = ((s as any).items ?? []) as any[];

  const returnedByProduct: Record<string, number> = {};
  const returns = (s as any).returns ?? [];
  for (const r of returns) {
    for (const ri of r.items ?? []) {
      returnedByProduct[ri.productId] = (returnedByProduct[ri.productId] ?? 0) + ri.quantity;
    }
  }

  return {
    id: s.id,
    customer_id: s.customerId ?? null,
    customer_name: (s as any).customer?.name ?? null,
    subtotal: s.subtotal,
    discount: s.discount,
    tax: (s as any).tax ?? 0,
    total: s.total,
    amount_paid: s.amountPaid,
    change: s.change,
    status: s.status,
    payment_method: (s as any).paymentMethod ?? null,
    invoice_no: (s as any).invoiceNo ?? null,
    profit: (s as any).profit ?? 0,
    created_at: s.createdAt,
    items: items.map((i: any) => ({
      id: i.id,
      sale_id: i.saleId ?? s.id,
      product_id: i.productId,
      product_name: i.productName,
      barcode: i.barcode,
      quantity: i.quantity,
      batch_id: i.batchId ?? null,
      batch_number: i.batchNumber ?? null,
      expiry: i.expiry ?? null,
      returned_qty: returnedByProduct[i.productId] ?? 0,
      unit_price: i.unitPrice,
      subtotal: i.subtotal,
    })),
    item_count: (s as any)._count?.items ?? items.length,
    return_count: (s as any)._count?.returns ?? 0,
  };
}

export const salesController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const sale = await salesService.create(req.body);
      res.json(normalizeSale(sale));
    } catch (err) {
      next(err);
    }
  },

  async listRecent(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const sales = await salesService.listRecent(limit);
      res.json(sales.map(normalizeSale));
    } catch (err) {
      next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = (req.query.q as string) ?? "";
      if (!q.trim()) return res.json([]);
      const sales = await salesService.search(q);
      res.json(sales.map(normalizeSale));
    } catch (err) {
      next(err);
    }
  },

  async listByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const tzOffsetMinutes = parseInt(req.query.tzOffset as string, 10) || 0;
      const sales = await salesService.listByDate(req.params.date, tzOffsetMinutes);
      res.json(sales.map(normalizeSale));
    } catch (err) {
      next(err);
    }
  },

  async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const isPaginated = req.query.paginated === "true";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string) || (isPaginated ? 50 : 100000));
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || undefined;

      const result = await salesService.listAll({
        search: req.query.search as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        tzOffsetMinutes: parseInt(req.query.tzOffset as string, 10) || 0,
        page,
        limit,
        sortBy,
        sortOrder,
      });

      const normalizedData = result.data.map(normalizeSale);

      if (isPaginated) {
        res.json({
          data: normalizedData,
          meta: result.meta
        });
      } else {
        res.json(normalizedData);
      }
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const sale = await salesService.getById(req.params.id);
      res.json(normalizeSale(sale));
    } catch (err) {
      next(err);
    }
  },
};
