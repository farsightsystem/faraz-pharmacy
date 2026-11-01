import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ShoppingCart, DollarSign, BarChart3, Search, ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/reports/DateRangePicker";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatLocalDateKey } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Sale } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";

export default function SalesReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: formatLocalDateKey(new Date(Date.now() - 30 * 86400000)),
    to: formatLocalDateKey(new Date()),
  });
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  // Paginated table data
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["sales", "report", page, limit, debouncedSearch, dateRange.from, dateRange.to],
    queryFn: () => api.sales.listPaginated({
      page,
      limit,
      search: debouncedSearch || undefined,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    }),
  });

  const sales = salesData?.data ?? [];
  const meta = salesData?.meta;

  const { data: summary } = useQuery({
    queryKey: ["sales", "summary", dateRange.from, dateRange.to],
    queryFn: () => api.reports.salesSummary({ dateFrom: dateRange.from, dateTo: dateRange.to }),
  });

  const totalRevenue = summary?.revenue ?? 0;
  const transactionCount = summary?.transactionCount ?? 0;
  const avgSale = transactionCount > 0 ? totalRevenue / transactionCount : 0;
  const profit = summary?.profit ?? 0;
  const outstanding = summary?.outstanding ?? 0;

  const chartData = useMemo(() => {
    const days = chartPeriod === "week" ? 7 : 30;
    const revenueByDay = new Map((summary?.dailyRevenue ?? []).map((row) => [row.day, row.revenue]));
    const data: { day: string; date: string; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dateStr = formatLocalDateKey(date);
      data.push({
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: revenueByDay.get(dateStr) ?? 0,
      });
    }
    return data;
  }, [summary?.dailyRevenue, chartPeriod]);

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [dateRange, debouncedSearch]);

  function handleReset() {
    setDateRange({
      from: formatLocalDateKey(new Date(Date.now() - 30 * 86400000)),
      to: formatLocalDateKey(new Date()),
    });
    setSearch("");
    setPage(1);
  }

  async function handlePDF() {
    const filteredSales = await api.sales.listAll({
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    });
    generatePDF({
      title: "Sales Report",
      dateRange,
      summary: [
        { label: "Revenue", value: formatCurrency(totalRevenue) },
        { label: "Transactions", value: String(transactionCount) },
        { label: "Average Sale", value: formatCurrency(avgSale) },
        { label: "Profit", value: formatCurrency(profit) },
      ],
      headers: [
        "Invoice",
        "Date",
        "Customer",
        "Items",
        "Subtotal",
        "Discount",
        "Total",
        "Paid",
        "Status",
      ],
      rows: filteredSales.map((s: Sale) => [
        s.invoice_no || "\u2014",
        formatDate(s.created_at),
        s.customer_name || "Walk-in",
        s.items?.length || 0,
        formatCurrency(s.subtotal),
        formatCurrency(s.discount),
        formatCurrency(s.total),
        formatCurrency(s.amount_paid),
        s.status,
      ]),
      filename: `sales_report_${dateRange.from}_${dateRange.to}.pdf`,
    });
  }

  async function handleExcel() {
    const filteredSales = await api.sales.listAll({
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    });
    downloadExcelFile(
      `sales_report_${dateRange.from}_${dateRange.to}.xlsx`,
      ["Invoice", "Date", "Customer", "Items", "Subtotal", "Discount", "Total", "Paid", "Status"],
      filteredSales.map((s: Sale) => [
        s.invoice_no || "\u2014",
        formatDate(s.created_at),
        s.customer_name || "Walk-in",
        s.items?.length || 0,
        s.subtotal,
        s.discount,
        s.total,
        s.amount_paid,
        s.status,
      ])
    );
  }

  const columns = [
    {
      key: "invoice_no",
      header: "Invoice",
      cell: (s: Sale) => (
        <span className="font-mono text-xs text-text-secondary">{s.invoice_no || "\u2014"}</span>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      cell: (s: Sale) => <span className="font-mono text-xs">{formatDate(s.created_at)}</span>,
    },
    {
      key: "customer_name",
      header: "Customer",
      cell: (s: Sale) => (
        <span className="font-medium text-text-primary">{s.customer_name || "Walk-in"}</span>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (s: Sale) => (
        <span className="font-mono text-text-secondary">{s.items?.length || 0}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      cell: (s: Sale) => <span className="font-mono font-semibold">{formatCurrency(s.total)}</span>,
    },
    {
      key: "amount_paid",
      header: "Paid",
      cell: (s: Sale) => <span className="font-mono">{formatCurrency(s.amount_paid)}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      cell: (s: Sale) => {
        const balance = s.total - s.amount_paid;
        return (
          <span className={`font-mono font-medium ${balance > 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(balance)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (s: Sale) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
        >
          {s.status}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Sales Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Sales performance and transaction history
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

<div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <Input
            placeholder="Search invoices, customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-surface border-border/80 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-9 rounded-xl text-text-secondary hover:text-text-primary" onClick={handleReset}>
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KPICard
          title="Transactions"
          value={transactionCount}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <KPICard
          title="Profit"
          value={formatCurrency(profit)}
          icon={<BarChart3 className="h-4 w-4" />}
          valueClassName="text-success"
        />
        <KPICard
          title="Outstanding"
          value={formatCurrency(outstanding)}
          icon={<DollarSign className="h-4 w-4" />}
          valueClassName={outstanding > 0 ? "text-warning" : ""}
        />
      </div>

      <Card className="mb-6 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-text-secondary">Revenue Trend</CardTitle>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setChartPeriod("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${chartPeriod === "week" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setChartPeriod("month")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${chartPeriod === "month" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              30 Days
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                <div className="relative w-full">
                  <div
                    className="w-full bg-gradient-to-t from-accent to-accent/60 rounded-t-sm transition-all duration-200 group-hover:from-accent-hover group-hover:to-accent cursor-pointer"
                    style={{
                      height: `${(d.revenue / maxRevenue) * 140}px`,
                      minHeight: d.revenue > 0 ? "4px" : "0",
                    }}
                  />
                  {d.revenue > 0 && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-text-primary text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-mono">
                      {formatCurrency(d.revenue)}
                    </div>
                  )}
                </div>
                {i % (chartPeriod === "week" ? 1 : 5) === 0 && (
                  <span className="text-[10px] text-text-secondary font-medium">
                    {chartPeriod === "week" ? d.day : d.date}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <DataTable
          columns={columns}
          data={sales}
          loading={isLoading}
          keyExtractor={(s: Sale) => s.id}
          emptyMessage="No sales found for the selected period"
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-text-secondary">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-text-secondary px-2">
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}