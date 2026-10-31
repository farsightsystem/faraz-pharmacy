import type { Request, Response, NextFunction } from "express";
import { returnsService } from "./returns.service";

function normalizeReturnItem(i: any) {
  return {
    id: i.id,
    product_id: i.productId,
    product_name: i.productName,
    quantity: i.quantity,
    refund_amount: i.refundAmount,
  };
}

function normalizeReturn(r: any) {
  return {
    id: r.id,
    sale_id: r.saleId,
    customer_name: r.sale?.customer?.name ?? null,
    refund_amount: r.refundAmount,
    reason: r.reason,
    created_at: r.createdAt,
    items: (r.items ?? []).map(normalizeReturnItem),
  };
}

export const returnsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const isPaginated = req.query.paginated === "true";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string) || (isPaginated ? 50 : 100000));
      const search = req.query.search as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || undefined;

      const result = await returnsService.list({ page, limit, search, sortBy, sortOrder });
      const normalizedData = result.data.map(normalizeReturn);

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
      const entry = await returnsService.getById(req.params.id);
      res.json(normalizeReturn(entry));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await returnsService.create(req.body);
      res.json(normalizeReturn(result));
    } catch (err) {
      next(err);
    }
  },
};
