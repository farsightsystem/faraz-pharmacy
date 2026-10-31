import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { errorHandler } from "./middleware/errors";
import { authRoutes } from "./modules/auth/auth.routes";
import { medicinesRoutes } from "./modules/medicines/medicines.routes";
import { salesRoutes } from "./modules/sales/sales.routes";
import { customersRoutes } from "./modules/customers/customers.routes";
import { arrearsRoutes } from "./modules/arrears/arrears.routes";
import { purchasesRoutes } from "./modules/purchases/purchases.routes";
import { suppliersRoutes } from "./modules/suppliers/suppliers.routes";
import { returnsRoutes } from "./modules/returns/returns.routes";
import { expensesRoutes } from "./modules/expenses/expenses.routes";
import { reportsRoutes } from "./modules/reports/reports.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { categoriesRoutes } from "./modules/categories/categories.routes";
import { companiesRoutes } from "./modules/companies/companies.routes";
import { barcodesRoutes } from "./modules/barcodes/barcodes.routes";
import { batchesRoutes } from "./modules/batches/batches.routes";

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", medicinesRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/arrears", arrearsRoutes);
app.use("/api/stock", purchasesRoutes);
app.use("/api/batches", batchesRoutes);
app.use("/api/distributors", suppliersRoutes);
app.use("/api/returns", returnsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/dashboard", reportsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/barcodes", barcodesRoutes);
app.use("/api/settings", settingsRoutes);

app.use(errorHandler);

export { app };
