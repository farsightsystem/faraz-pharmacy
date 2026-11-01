import type { Request, Response, NextFunction } from "express";
import { batchesService } from "./batches.service";
import { getPaginationParams } from "../../utils/pagination";

export const batchesController = {
  async listByProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const batches = await batchesService.listByProduct(req.params.productId);
      res.json(batches);
    } catch (err) {
      next(err);
    }
  },

  async listExpiring(req: Request, res: Response, next: NextFunction) {
    try {
      const days = parseInt(req.query.days as string, 10) || 60;
      const batches = await batchesService.listExpiring(days);
      res.json(batches);
    } catch (err) {
      next(err);
    }
  },

  async trace(req: Request, res: Response, next: NextFunction) {
    try {
      const batchNumber = (req.query.batchNumber as string) || req.params.batchNumber || "";
      const result = await batchesService.traceBatch(batchNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = getPaginationParams(req.query.page, req.query.limit, true);
      const search = (req.query.search as string) || "";
      const productId = req.query.productId as string | undefined;

      const result = await batchesService.listAll({ page, limit, search, productId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
