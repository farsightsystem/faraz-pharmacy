import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle, Clock, Package } from "lucide-react";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Product } from "@/types";

type QuickFilter = "all" | "expired" | "7days" | "30days" | "90days" | "6months";

function getDaysUntilExpiry(expiry: string): number {
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function getExpiryStatus(days: number): { label: string; className: string; dot: string } {
  if (days <= 0) return { label: "Expired", className: "bg-danger text-white", dot: "bg-white" };
  if (days <= 7)
    return { label: "Critical", className: "bg-danger/10 text-danger", dot: "bg-danger" };
  if (days <= 30)
    return { label: "Warning", className: "bg-warning/10 text-warning", dot: "bg-warning" };
  if (days <= 90)
    return { label: "Caution", className: "bg-info/10 text-info", dot: "bg-info" };
  return { label: "Safe", className: "bg-success/10 text-success", dot: "bg-success" };
}

export default function ExpiryReport() {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: api.products.list,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const expirableProducts = useMemo(
    () => products.filter((p: Product) => p.expiry && p.stock_qty > 0),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return expirableProducts.filter((p: Product) => {
      const days = getDaysUntilExpiry(p.expiry!);
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      let matchesFilter = true;
      if (quickFilter === "expired") matchesFilter = days <= 0;
      else if (quickFilter === "7days") matchesFilter = days > 0 && days <= 7;
      else if (quickFilter === "30days") matchesFilter = days > 0 && days <= 30;
      else if (quickFilter === "90days") matchesFilter = days > 0 && days <= 90;
      else if (quickFilter === "6months") matchesFilter = days > 0 && days <= 180;
      return matchesSearch && matchesFilter;
    });
  }, [expirableProducts, search, quickFilter]);

  const expiredCount = expirableProducts.filter(
    (p: Product) => getDaysUntilExpiry(p.expiry!) <= 0
  ).length;
  const expiring30 = expirableProducts.filter((p: Product) => {
    const d = getDaysUntilExpiry(p.expiry!);
    return d > 0 && d <= 30;
  }).length;
  const expiring90 = expirableProducts.filter((p: Product) => {
    const d = getDaysUntilExpiry(p.expiry!);
    return d > 0 && d <= 90;
  }).length;
  const atRiskValue = expirableProducts
    .filter((p: Product) => getDaysUntilExpiry(p.expiry!) <= 90)
    .reduce((sum: number, p: Product) => sum + p.stock_qty * p.purchase_price, 0);

  const quickFilters: { label: string; value: QuickFilter; count?: number }[] = [
    { label: "All", value: "all" },
    { label: "Expired", value: "expired", count: expiredCount },
    { label: "7 Days", value: "7days" },
    { label: "30 Days", value: "30days", count: expiring30 },
    { label: "90 Days", value: "90days", count: expiring90 },
    { label: "6 Months", value: "6months" },
  ];

  function handlePDF() {
    generatePDF({
      title: "Expiry Report",
      summary: [
        { label: "Expired", value: String(expiredCount) },
        { label: "<30 Days", value: String(expiring30) },
        { label: "<90 Days", value: String(expiring90) },
        { label: "At-Risk Value", value: formatCurrency(atRiskValue) },
      ],
      headers: ["Medicine", "Batch", "Expiry", "Qty", "Purchase", "Value", "Days Left", "Status"],
      rows: filteredProducts.map((p: Product) => {
        const d = getDaysUntilExpiry(p.expiry!);
        return [
          p.name,
          p.batch_no || "—",
          formatDate(p.expiry!),
          p.stock_qty,
          formatCurrency(p.purchase_price),
          formatCurrency(p.stock_qty * p.purchase_price),
          d <= 0 ? "Expired" : d,
          getExpiryStatus(d).label,
        ];
      }),
      filename: `expiry_report_${new Date().toISOString().split("T")[0]}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `expiry_report_${new Date().toISOString().split("T")[0]}.xlsx`,
      ["Medicine", "Batch", "Expiry", "Qty", "Purchase", "Value", "Days Left", "Status"],
      filteredProducts.map((p: Product) => {
        const d = getDaysUntilExpiry(p.expiry!);
        return [
          p.name,
          p.batch_no || "—",
          formatDate(p.expiry!),
          p.stock_qty,
          p.purchase_price,
          p.stock_qty * p.purchase_price,
          d <= 0 ? "Expired" : d,
          getExpiryStatus(d).label,
        ];
      })
    );
  }

  const columns = [
    {
      key: "name",
      header: "Medicine",
      cell: (p: Product) => <span className="font-medium text-text-primary">{p.name}</span>,
    },
    {
      key: "batch_no",
      header: "Batch",
      cell: (p: Product) => (
        <span className="font-mono text-xs text-text-secondary">{p.batch_no || "—"}</span>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      cell: (p: Product) => <span className="font-mono text-xs">{formatDate(p.expiry!)}</span>,
    },
    {
      key: "stock_qty",
      header: "Qty",
      cell: (p: Product) => <span className="font-mono">{p.stock_qty}</span>,
    },
    {
      key: "stock_value",
      header: "Value",
      cell: (p: Product) => (
        <span className="font-mono text-sm">{formatCurrency(p.stock_qty * p.purchase_price)}</span>
      ),
    },
    {
      key: "days",
      header: "Days Left",
      cell: (p: Product) => {
        const d = getDaysUntilExpiry(p.expiry!);
        return (
          <span
            className={`font-mono font-semibold ${d <= 0 ? "text-danger" : d <= 7 ? "text-danger" : d <= 30 ? "text-warning" : ""}`}
          >
            {d <= 0 ? "Expired" : d}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (p: Product) => {
        const s = getExpiryStatus(getDaysUntilExpiry(p.expiry!));
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Expiry Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Track medicine expiry dates and manage at-risk stock
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <Input
          placeholder="Search medicine..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-56 rounded-xl bg-surface border-border/80 text-xs shadow-xs"
        />
        <div className="flex items-center border border-border rounded-lg overflow-hidden h-9">
          {quickFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setQuickFilter(f.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                quickFilter === f.value
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px]",
                    quickFilter === f.value ? "bg-white/20" : "bg-danger/10 text-danger"
                  )}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Expired"
          value={expiredCount}
          icon={<XCircle className="h-4 w-4" />}
          valueClassName="text-danger"
        />
        <KPICard
          title="< 30 Days"
          value={expiring30}
          icon={<Clock className="h-4 w-4" />}
          valueClassName="text-warning"
        />
        <KPICard
          title="< 90 Days"
          value={expiring90}
          icon={<AlertTriangle className="h-4 w-4" />}
          valueClassName="text-accent"
        />
        <KPICard
          title="At-Risk Value"
          value={formatCurrency(atRiskValue)}
          icon={<Package className="h-4 w-4" />}
          valueClassName="text-danger"
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredProducts}
          loading={isLoading}
          keyExtractor={(p: Product) => p.id}
          emptyMessage="No expiring products found"
        />
      </div>
    </div>
  );
}
