import type { Request, Response, NextFunction } from "express";
import { categoriesService } from "./categories.service";
import { getPaginationParams } from "../../utils/pagination";

export const categoriesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = getPaginationParams(req.query.page, req.query.limit, true);
      const search = req.query.search as string | undefined;
      const archivedOnly = req.query.archived === "true" || req.query.archivedOnly === "true";
      const includeArchived = req.query.includeArchived === "true";
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = req.query.sortOrder === "asc" ? "asc" : (req.query.sortOrder === "desc" ? "desc" : undefined);

      const result = await categoriesService.list({
        page,
        limit,
        search,
        archivedOnly,
        includeArchived,
        sortBy,
        sortOrder,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoriesService.create(req.body);
      res.json(category);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await categoriesService.update(req.params.id, req.body);
      res.json(category);
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await categoriesService.remove(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await categoriesService.restore(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async hardDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await categoriesService.hardDelete(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
