import type { Request, Response, NextFunction } from "express";
import { medicinesService } from "./medicines.service";
import { normalizeProduct, normalizeProductList } from "../../utils/normalize";

export const medicinesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const isPaginated = req.query.paginated === "true";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string) || (isPaginated ? 50 : 100000));
      const search = req.query.search as string | undefined;
      const includeArchived = req.query.includeArchived === "true";
      const archivedOnly = req.query.archivedOnly === "true" || req.query.archived === "true";
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder === "asc" ? "asc" : "desc") as "asc" | "desc";
      
      const result = await medicinesService.list({ page, limit, search, includeArchived, archivedOnly, sortBy, sortOrder });
      result.data = normalizeProductList(result.data) as any[];
      
      if (isPaginated) {
        res.json(result);
      } else {
        res.json(result.data);
      }
    } catch (err) {
      next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query.q as string;
      if (!q) return res.json([]);
      const products = await medicinesService.search(q);
      res.json(products);
    } catch (err) {
      next(err);
    }
  },

  async getByBarcode(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await medicinesService.getByBarcode(req.params.b);
      res.json(normalizeProduct(product));
    } catch (err) {
      next(err);
    }
  },

  async getByBarcodeFast(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await medicinesService.getByBarcodeFast(req.params.b);
      res.json(product);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await medicinesService.getById(req.params.id);
      res.json(normalizeProduct(product));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await medicinesService.create(req.body);
      res.json(normalizeProduct(product));
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await medicinesService.update(req.params.id, req.body);
      res.json(normalizeProduct(product));
    } catch (err) {
      next(err);
    }
  },

  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      await medicinesService.archive(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      await medicinesService.restore(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async hardDelete(req: Request, res: Response, next: NextFunction) {
    try {
      await medicinesService.hardDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
