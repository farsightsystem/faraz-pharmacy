import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Truck, Boxes, DollarSign, Search, ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/reports/DateRangePicker";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { StockPurchase } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";

export default function PurchaseReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  // Paginated table data
  const { data: purchaseData, isLoading } = useQuery({
    queryKey: ["stock", "report", page, limit, debouncedSearch, dateRange.from, dateRange.to],
    queryFn: () =>
      api.stock.listPaginated({
        page,
        limit,
        search: debouncedSearch || undefined,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      }),
  });

  const purchases = purchaseData?.data ?? [];
  const meta = purchaseData?.meta;

  // Summary data for KPIs and exports
  const { data: allPurchases = [] } = useQuery({
    queryKey: ["stock", "summary", dateRange.from, dateRange.to],
    queryFn: () => api.stock.list({ dateFrom: dateRange.from, dateTo: dateRange.to }),
  });

  const filteredPurchases = useMemo(() => {
    return allPurchases.filter((p: StockPurchase) => {
      const pDate = p.created_at ? p.created_at.slice(0, 10) : "";
      const inDateRange = pDate >= dateRange.from && pDate <= dateRange.to;
      return inDateRange;
    });
  }, [allPurchases, dateRange]);

  const totalPurchases = filteredPurchases.reduce(
    (sum: number, p: StockPurchase) => sum + (p.total_value ?? p.quantity * p.purchase_price),
    0
  );
  const totalUnits = filteredPurchases.reduce(
    (sum: number, p: StockPurchase) => sum + (p.quantity || 0),
    0
  );
  const uniqueSuppliers = new Set(
    filteredPurchases.map((p: StockPurchase) => p.distributor_name).filter(Boolean)
  ).size;
  const avgCostPerEntry = filteredPurchases.length > 0 ? totalPurchases / filteredPurchases.length : 0;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [dateRange, debouncedSearch]);

  function handleReset() {
    setDateRange({
      from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
      to: new Date().toISOString().split("T")[0],
    });
    setSearch("");
    setPage(1);
  }

  function handlePDF() {
    generatePDF({
      title: "Stock Purchase Report",
      dateRange,
      summary: [
        { label: "Total Purchases", value: formatCurrency(totalPurchases) },
        { label: "Total Inward Units", value: `${totalUnits} units` },
        { label: "Entries", value: String(filteredPurchases.length) },
        { label: "Suppliers", value: String(uniqueSuppliers) },
      ],
      headers: [
        "Invoice #",
        "Date",
        "Medicine",
        "Supplier",
        "Batch #",
        "Qty",
        "Unit Cost",
        "Total Value",
        "Expiry",
      ],
      rows: filteredPurchases.map((p: StockPurchase) => [
        p.invoice_number || "\u2014",
        formatDate(p.created_at),
        p.product_name || "\u2014",
        p.distributor_name || "\u2014",
        p.batch_number || "\u2014",
        p.quantity,
        formatCurrency(p.purchase_price),
        formatCurrency(p.total_value ?? p.quantity * p.purchase_price),
        p.expiry ? formatDate(p.expiry) : "\u2014",
      ]),
      filename: `purchase_report_${dateRange.from}_${dateRange.to}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `purchase_report_${dateRange.from}_${dateRange.to}.xlsx`,
      [
        "Invoice #",
        "Date",
        "Medicine",
        "Supplier",
        "Batch #",
        "Qty",
        "Unit Cost",
        "Total Value",
        "Expiry",
      ],
      filteredPurchases.map((p: StockPurchase) => [
        p.invoice_number || "\u2014",
        formatDate(p.created_at),
        p.product_name || "\u2014",
        p.distributor_name || "\u2014",
        p.batch_number || "\u2014",
        p.quantity,
        p.purchase_price,
        p.total_value ?? p.quantity * p.purchase_price,
        p.expiry ? formatDate(p.expiry) : "\u2014",
      ])
    );
  }

  const columns = [
    {
      key: "invoice_number",
      header: "Invoice #",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {p.invoice_number || "\u2014"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs text-text-secondary">{formatDate(p.created_at)}</span>
      ),
    },
    {
      key: "product_name",
      header: "Medicine / Product",
      cell: (p: StockPurchase) => (
        <span className="font-medium text-text-primary">{p.product_name || "\u2014"}</span>
      ),
    },
    {
      key: "distributor_name",
      header: "Supplier",
      cell: (p: StockPurchase) => (
        <span className="text-xs text-text-secondary">{p.distributor_name || "\u2014"}</span>
      ),
    },
    {
      key: "batch_number",
      header: "Batch #",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs text-text-secondary">{p.batch_number || "\u2014"}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs font-bold text-brand">{p.quantity}</span>
      ),
    },
    {
      key: "purchase_price",
      header: "Unit Cost",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatCurrency(p.purchase_price)}
        </span>
      ),
    },
    {
      key: "total_value",
      header: "Total Value",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs font-bold text-text-primary">
          {formatCurrency(p.total_value ?? p.quantity * p.purchase_price)}
        </span>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      cell: (p: StockPurchase) => (
        <span className="font-mono text-xs text-text-secondary">
          {p.expiry ? formatDate(p.expiry) : "\u2014"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Purchase Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Audit inventory purchase orders, supplier stock receipts, and inward shipments
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <Input
            placeholder="Search invoice #, medicine, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-surface border-border/80 text-xs shadow-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-xl text-text-secondary hover:text-text-primary cursor-pointer"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Purchases"
          value={formatCurrency(totalPurchases)}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <KPICard
          title="Inward Units"
          value={`${totalUnits} units`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <KPICard
          title="Suppliers"
          value={uniqueSuppliers}
          icon={<Truck className="h-4 w-4" />}
        />
        <KPICard
          title="Avg Order Cost"
          value={formatCurrency(avgCostPerEntry)}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-2xl border border-border/80 bg-surface overflow-hidden shadow-xs">
        <DataTable
          columns={columns}
          data={purchases}
          loading={isLoading}
          keyExtractor={(p: StockPurchase) => p.id}
          emptyMessage="No purchases found in this period"
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-text-secondary">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-8 rounded-lg cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-text-secondary px-2">
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
              className="h-8 rounded-lg cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}