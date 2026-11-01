import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Wallet, ArrowUpRight } from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/reports/DateRangePicker";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Sale, Expense } from "@/types";

export default function IncomeReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "all", dateRange.from, dateRange.to],
    queryFn: () => api.sales.listAll({ dateFrom: dateRange.from, dateTo: dateRange.to }),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", dateRange.from, dateRange.to],
    queryFn: () => api.expenses.list({ dateFrom: dateRange.from, dateTo: dateRange.to }),
  });

  const filteredSales = useMemo(
    () =>
      sales.filter(
        (s: Sale) => s.created_at >= dateRange.from && s.created_at <= dateRange.to + "T23:59:59"
      ),
    [sales, dateRange]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e: Expense) => e.date >= dateRange.from && e.date <= dateRange.to),
    [expenses, dateRange]
  );

  const totalRevenue = filteredSales.reduce((sum: number, s: Sale) => sum + s.total, 0);
  const totalExpenses = filteredExpenses.reduce((sum: number, e: Expense) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpenses;
  const costOfGoods = filteredSales.reduce(
    (sum: number, s: Sale) =>
      sum +
      (s.items?.reduce(
        (isum: number, item: any) => isum + (item.purchase_price || 0) * item.quantity,
        0
      ) || 0),
    0
  );
  const grossProfit = totalRevenue - costOfGoods;

  const incomeData = [
    { label: `${filteredSales.length} sales transactions`, type: "income", amount: totalRevenue },
    ...filteredExpenses.map((e: Expense) => ({
      label: e.title,
      type: "expense" as const,
      amount: e.amount,
    })),
  ];

  function handlePDF() {
    generatePDF({
      title: "Income Report",
      dateRange,
      summary: [
        { label: "Revenue", value: formatCurrency(totalRevenue) },
        { label: "Expenses", value: formatCurrency(totalExpenses) },
        { label: "Net Income", value: formatCurrency(netIncome) },
      ],
      headers: ["Description", "Type", "Amount"],
      rows: [
        [`Sales Revenue`, "Income", formatCurrency(totalRevenue)],
        ...filteredExpenses.map((e: Expense) => [
          e.title,
          "Expense",
          `-${formatCurrency(e.amount)}`,
        ]),
        ["", "", ""],
        ["Net Income", "", formatCurrency(netIncome)],
      ],
      filename: `income_report_${dateRange.from}_${dateRange.to}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `income_report_${dateRange.from}_${dateRange.to}.xlsx`,
      ["Description", "Type", "Amount"],
      [
        ["Total Revenue", "Income", totalRevenue],
        ...filteredExpenses.map((e: Expense) => [e.title, "Expense", -e.amount]),
        ["", "", ""],
        ["Net Income", "", netIncome],
      ]
    );
  }

  const summaryRows = [
    { label: "Total Revenue", value: formatCurrency(totalRevenue) },
    { label: "Cost of Goods Sold", value: formatCurrency(costOfGoods) },
    { label: "Gross Profit", value: formatCurrency(grossProfit), highlight: true },
    { label: "Operating Expenses", value: formatCurrency(totalExpenses) },
    { label: "Net Income", value: formatCurrency(netIncome), highlight: true, isTotal: true },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Income Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Comprehensive view of revenue, expenses, and net income
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
          valueClassName="text-accent"
        />
        <KPICard
          title="Sales Income"
          value={formatCurrency(totalRevenue)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Expenses"
          value={formatCurrency(totalExpenses)}
          icon={<Wallet className="h-4 w-4" />}
          valueClassName="text-danger"
        />
        <KPICard
          title="Net Income"
          value={formatCurrency(netIncome)}
          icon={<ArrowUpRight className="h-4 w-4" />}
          valueClassName={netIncome >= 0 ? "text-success" : "text-danger"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border/80 bg-surface shadow-xs p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wide">
            Income Summary
          </h3>
          <div className="space-y-0">
            {summaryRows.map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-3 ${row.isTotal ? "border-t-2 border-border mt-2" : i > 0 ? "border-t border-border/50" : ""}`}
              >
                <span
                  className={`text-sm ${row.isTotal ? "font-semibold text-text-primary" : "text-text-secondary"}`}
                >
                  {row.label}
                </span>
                <span
                  className={`font-mono ${row.isTotal ? "text-lg font-bold text-accent" : row.highlight ? "font-semibold text-text-primary" : "text-sm text-text-primary"}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/50 overflow-hidden">
          <DataTable
            columns={[
              {
                key: "label",
                header: "Description",
                cell: (row: any) => <span className="text-text-primary">{row.label}</span>,
              },
              {
                key: "type",
                header: "Type",
                cell: (row: any) => (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${row.type === "income" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${row.type === "income" ? "bg-success" : "bg-danger"}`}
                    />
                    {row.type}
                  </span>
                ),
              },
              {
                key: "amount",
                header: "Amount",
                cell: (row: any) => (
                  <span
                    className={`font-mono font-medium ${row.type === "expense" ? "text-danger" : "text-success"}`}
                  >
                    {row.type === "expense" ? "-" : ""}
                    {formatCurrency(row.amount)}
                  </span>
                ),
              },
            ]}
            data={incomeData}
            keyExtractor={(row: any) => `${row.label}-${row.amount}-${row.type}`}
            emptyMessage="No income data"
          />
        </div>
      </div>
    </div>
  );
}
