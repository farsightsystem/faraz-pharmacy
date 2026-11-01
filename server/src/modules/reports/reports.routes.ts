import { Router } from "express";
import { reportsController } from "./reports.controller";

const router = Router();

router.get("/stats", reportsController.stats);
router.get("/sales-summary", reportsController.salesSummary);
router.get("/purchase-summary", reportsController.purchaseSummary);
router.get("/expense-summary", reportsController.expenseSummary);
router.get("/income-summary", reportsController.incomeSummary);
router.get("/product", reportsController.productReport);

export { router as reportsRoutes };
