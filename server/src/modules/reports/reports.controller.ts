import type { Request, Response, NextFunction } from "express";
import { reportsService } from "./reports.service";

export const reportsController = {
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const tzOffsetMinutes = Number.parseInt(String(req.query.tzOffset ?? "0"), 10) || 0;
      const stats = await reportsService.getStats(tzOffsetMinutes);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  },

  async salesSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await reportsService.getSalesSummary({
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        tzOffsetMinutes: Number.parseInt(String(req.query.tzOffset ?? "0"), 10) || 0,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },

  async purchaseSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await reportsService.getPurchaseSummary({
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },

  async expenseSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await reportsService.getExpenseSummary({
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },

  async incomeSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const opts = {
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        tzOffsetMinutes: Number.parseInt(String(req.query.tzOffset ?? "0"), 10) || 0,
      };
      const [sales, expenses] = await Promise.all([
        reportsService.getSalesSummary(opts),
        reportsService.getExpenseSummary(opts),
      ]);
      res.json({
        revenue: sales.revenue,
        costOfGoods: sales.costOfGoods,
        expenses: expenses.total,
        transactionCount: sales.transactionCount,
      });
    } catch (err) {
      next(err);
    }
  },

  async productReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, dateFrom, dateTo, tzOffset } = req.query;
      if (!productId || typeof productId !== "string") {
        res.status(400).json({ error: "productId query parameter is required" });
        return;
      }
      const report = await reportsService.getProductReport({
        productId,
        dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
        dateTo: typeof dateTo === "string" ? dateTo : undefined,
        tzOffsetMinutes: tzOffset ? parseInt(String(tzOffset), 10) : undefined,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
};
