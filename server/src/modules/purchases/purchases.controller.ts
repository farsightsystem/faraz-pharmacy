import type { Request, Response, NextFunction } from "express";
import { purchasesService } from "./purchases.service";
import { normalizeStockPurchase, normalizeStockPurchaseList } from "../../utils/normalize";

export const purchasesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const isPaginated = req.query.paginated === "true";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string) || (isPaginated ? 50 : 100000));
      const search = req.query.search as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const archived = req.query.archived === "true" || req.query.archivedOnly === "true";
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = req.query.sortOrder === "asc" ? "asc" : (req.query.sortOrder === "desc" ? "desc" : undefined);

      const result = await purchasesService.list({ page, limit, search, dateFrom, dateTo, archived, sortBy, sortOrder });
      const normalizedData = normalizeStockPurchaseList(result.data);

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

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.create(req.body);
      res.json(normalizeStockPurchase(result));
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.update(req.params.id, req.body);
      res.json(normalizeStockPurchase(result));
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.remove(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.restore(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async hardDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.hardDelete(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};

