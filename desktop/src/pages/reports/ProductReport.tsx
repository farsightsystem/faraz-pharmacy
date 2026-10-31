import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Calendar,
  RotateCcw,
  Boxes,
  Percent,
  Search,
  PackageSearch,
  Clock,
  Building2,
  Tag,
  MapPin,
  Barcode as BarcodeIcon,
  Undo2,
  Sparkles,
  Loader2,
} from "lucide-react";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Product, ProductReportData } from "@/types";

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProductReport() {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [activePreset, setActivePreset] = useState<"all" | "today" | "week" | "month" | "30days">("30days");
  const [dateFrom, setDateFrom] = useState<string>(
    toLocalDateString(new Date(Date.now() - 30 * 86400000))
  );
  const [dateTo, setDateTo] = useState<string>(toLocalDateString(new Date()));

  // Active query parameters used for fetching (updated when "Load Report" is clicked)
  const [appliedParams, setAppliedParams] = useState<{
    productId: string;
    dateFrom: string;
    dateTo: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"sales" | "batches" | "purchases">("sales");

  // Fetch product catalog for searchable selector
  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["products", "report-options"],
    queryFn: api.products.list,
  });

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: `${p.name} · ${p.company || p.category || "Medicine"} (Stock: ${p.stock_qty})`,
    }));
  }, [products]);

  // Fetch product report when appliedParams is set
  const {
    data: reportData,
    isLoading: loadingReport,
    isFetching,
    refetch,
  } = useQuery<ProductReportData>({
    queryKey: [
      "product-report",
      appliedParams?.productId,
      appliedParams?.dateFrom,
      appliedParams?.dateTo,
    ],
    queryFn: () =>
      api.reports.productReport({
        productId: appliedParams!.productId,
        dateFrom: appliedParams?.dateFrom || undefined,
        dateTo: appliedParams?.dateTo || undefined,
      }),
    enabled: Boolean(appliedParams?.productId),
  });

  const handlePresetSelect = (preset: "all" | "today" | "week" | "month" | "30days") => {
    setActivePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (preset === "today") {
      const todayStr = toLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === "week") {
      const dayOfWeek = now.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      setDateFrom(toLocalDateString(monday));
      setDateTo(toLocalDateString(now));
    } else if (preset === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(toLocalDateString(firstDay));
      setDateTo(toLocalDateString(now));
    } else if (preset === "30days") {
      setDateFrom(toLocalDateString(new Date(Date.now() - 30 * 86400000)));
      setDateTo(toLocalDateString(now));
    }
  };

  const handleLoadReport = () => {
    if (!selectedProductId) return;
    setAppliedParams({
      productId: selectedProductId,
      dateFrom,
      dateTo,
    });
  };

  const handleReset = () => {
    setSelectedProductId("");
    setActivePreset("30days");
    setDateFrom(toLocalDateString(new Date(Date.now() - 30 * 86400000)));
    setDateTo(toLocalDateString(new Date()));
    setAppliedParams(null);
  };

  const selectedProductPreview = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const p = reportData?.product;
  const s = reportData?.summary;

  function handlePDF() {
    if (!reportData || !p || !s) return;
    generatePDF({
      title: `Product Report: ${p.name}`,
      dateRange: {
        from: appliedParams?.dateFrom || "Start",
        to: appliedParams?.dateTo || "Present",
      },
      summary: [
        { label: "Product Name", value: p.name },
        { label: "Barcode", value: p.barcode || "—" },
        { label: "Units Sold", value: `${s.totalUnitsSold} units` },
        { label: "Total Revenue", value: formatCurrency(s.totalRevenue) },
        { label: "Net Profit", value: formatCurrency(s.totalProfit) },
        { label: "Current Stock", value: `${p.stockQty} units` },
        { label: "Margin", value: `${s.marginPercent}%` },
      ],
      headers: ["Invoice ID", "Date", "Customer", "Quantity", "Unit Price", "Subtotal", "Profit"],
      rows: reportData.salesHistory.map((row) => [
        row.saleId,
        formatDate(row.createdAt),
        row.customerName,
        row.quantity,
        formatCurrency(row.unitPrice),
        formatCurrency(row.subtotal),
        formatCurrency(row.profit),
      ]),
      filename: `product_report_${p.name.replace(/\s+/g, "_")}.pdf`,
    });
  }

  function handleExcel() {
    if (!reportData || !p) return;
    downloadExcelFile(
      `product_report_${p.name.replace(/\s+/g, "_")}.xlsx`,
      ["Invoice ID", "Date", "Customer", "Quantity", "Unit Price", "Subtotal", "Profit"],
      reportData.salesHistory.map((row) => [
        row.saleId,
        formatDate(row.createdAt),
        row.customerName,
        row.quantity,
        row.unitPrice,
        row.subtotal,
        row.profit,
      ])
    );
  }

  const salesColumns = [
    {
      key: "createdAt",
      header: "Date & Time",
      cell: (item: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatDateTime(item.createdAt)}
        </span>
      ),
    },
    {
      key: "saleId",
      header: "Invoice ID",
      cell: (item: any) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {item.saleId}
        </span>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      cell: (item: any) => (
        <span className="text-xs font-medium text-text-primary">
          {item.customerName}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Units Sold",
      cell: (item: any) => (
        <span className="font-mono text-xs font-bold text-brand">
          {item.quantity}
        </span>
      ),
    },
    {
      key: "unitPrice",
      header: "Unit Price",
      cell: (item: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatCurrency(item.unitPrice)}
        </span>
      ),
    },
    {
      key: "subtotal",
      header: "Subtotal",
      cell: (item: any) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {formatCurrency(item.subtotal)}
        </span>
      ),
    },
    {
      key: "profit",
      header: "Profit",
      cell: (item: any) => (
        <span className="font-mono text-xs font-bold text-success">
          {formatCurrency(item.profit)}
        </span>
      ),
    },
  ];

  const batchColumns = [
    {
      key: "batchNumber",
      header: "Batch #",
      cell: (b: any) => (
        <span className="font-mono text-xs font-bold text-text-primary">
          {b.batchNumber}
        </span>
      ),
    },
    {
      key: "expiryDate",
      header: "Expiry Date",
      cell: (b: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {b.expiryDate || "—"}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Remaining Qty",
      cell: (b: any) => (
        <span className="font-mono text-xs font-bold text-brand">
          {b.quantity} units
        </span>
      ),
    },
    {
      key: "initialQty",
      header: "Initial Qty",
      cell: (b: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {b.initialQty} units
        </span>
      ),
    },
    {
      key: "distributorName",
      header: "Distributor",
      cell: (b: any) => (
        <span className="text-xs text-text-secondary">
          {b.distributorName}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (b: any) => (
        <Badge variant={b.quantity > 0 ? "default" : "neutral"}>
          {b.quantity > 0 ? "Active" : "Depleted"}
        </Badge>
      ),
    },
  ];

  const purchaseColumns = [
    {
      key: "createdAt",
      header: "Purchase Date",
      cell: (sp: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatDate(sp.createdAt)}
        </span>
      ),
    },
    {
      key: "invoiceNumber",
      header: "Invoice #",
      cell: (sp: any) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {sp.invoiceNumber}
        </span>
      ),
    },
    {
      key: "distributorName",
      header: "Supplier / Distributor",
      cell: (sp: any) => (
        <span className="text-xs text-text-primary font-medium">
          {sp.distributorName}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Qty Received",
      cell: (sp: any) => (
        <span className="font-mono text-xs font-bold text-brand">
          {sp.quantity} units
        </span>
      ),
    },
    {
      key: "purchasePrice",
      header: "Unit Purchase Price",
      cell: (sp: any) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatCurrency(sp.purchasePrice)}
        </span>
      ),
    },
    {
      key: "totalCost",
      header: "Total Cost",
      cell: (sp: any) => (
        <span className="font-mono text-xs font-bold text-text-primary">
          {formatCurrency(sp.quantity * sp.purchasePrice)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Package className="h-5 w-5 text-brand" />
            Product Audit & Performance Report
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Audit item sales velocity, profit margins, active batches, and distributor inward history
          </p>
        </div>
        {reportData && <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />}
      </div>

      {/* Filter & Selector Toolbar */}
      <div className="rounded-3xl border border-border/80 bg-surface p-4 shadow-xs space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* Product Select Field */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-brand" />
              Select Product *
            </label>
            <SearchableSelect
              options={productOptions}
              value={selectedProductId}
              onChange={(v) => setSelectedProductId(v)}
              placeholder="Search by medicine name, company or stock..."
            />
          </div>

          {/* Date Range Inputs */}
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-brand" />
              Audit Window
            </label>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-2/60 border border-border/60">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset("all");
                }}
                className="bg-transparent text-xs text-text-primary font-medium outline-none px-2 py-1 flex-1 cursor-pointer"
              />
              <span className="text-text-tertiary text-xs font-bold">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset("all");
                }}
                className="bg-transparent text-xs text-text-primary font-medium outline-none px-2 py-1 flex-1 cursor-pointer"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <Button
              onClick={handleLoadReport}
              disabled={!selectedProductId || isFetching}
              className="flex-1 h-9 rounded-xl font-semibold gap-1.5 bg-[#3612B8] hover:bg-[#2A0E94] dark:bg-[#6236ff] text-white shadow-xs cursor-pointer"
            >
              {isFetching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Load Report</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-9 rounded-xl border-dashed text-text-secondary hover:text-danger hover:bg-danger/10 cursor-pointer"
              title="Reset product and filters"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick Date Presets Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
          <span className="text-[11px] font-semibold text-text-secondary mr-1">Quick Range:</span>
          {[
            { id: "30days", label: "Last 30 Days" },
            { id: "today", label: "Today" },
            { id: "week", label: "This Week" },
            { id: "month", label: "This Month" },
            { id: "all", label: "All Time" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id as any)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer",
                activePreset === preset.id
                  ? "bg-brand text-white shadow-xs font-bold"
                  : "text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-2/80"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isFetching && (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-xs text-text-secondary font-medium">
            Aggregating product sales, margins, and batch history...
          </p>
        </div>
      )}

      {/* Empty State before load */}
      {!appliedParams && !isFetching && (
        <div className="rounded-3xl border-2 border-dashed border-border/80 bg-surface/40 p-12 text-center flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-3xl bg-brand/10 text-brand flex items-center justify-center mb-4 shadow-xs">
            <PackageSearch className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-text-primary">
            Select a Product to Generate Report
          </h3>
          <p className="text-xs text-text-secondary mt-1 max-w-md leading-relaxed">
            Choose any medicine from the dropdown above, select your audit timeframe, and click{" "}
            <strong>Load Report</strong> to view full sales volume, profit, active batches, and distributor purchase records.
          </p>

          {/* Quick Select Picks */}
          {products.length > 0 && (
            <div className="mt-6 pt-5 border-t border-border/40 max-w-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-2.5">
                Or pick a popular medicine:
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {products.slice(0, 5).map((prod) => (
                  <button
                    key={prod.id}
                    onClick={() => {
                      setSelectedProductId(prod.id);
                      setAppliedParams({
                        productId: prod.id,
                        dateFrom,
                        dateTo,
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl bg-surface border border-border/80 hover:border-brand/40 hover:text-brand shadow-xs transition-colors cursor-pointer"
                  >
                    {prod.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loaded Report View */}
      {reportData && !isFetching && p && s && (
        <div className="space-y-6">
          {/* Product Identity Summary Card */}
          <div className="rounded-3xl border border-border/80 bg-gradient-to-r from-surface via-surface to-brand/5 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-text-primary font-display">
                  {p.name}
                </h3>
                <Badge variant={p.stockQty > 10 ? "default" : p.stockQty > 0 ? "warning" : "danger"}>
                  {p.stockQty > 10 ? "In Stock" : p.stockQty > 0 ? "Low Stock" : "Out of Stock"}
                </Badge>
                {p.category && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary border border-border/40 flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {p.category}
                  </span>
                )}
                {p.company && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary border border-border/40 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {p.company}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-text-secondary flex-wrap">
                {p.barcode && (
                  <span className="flex items-center gap-1 font-mono">
                    <BarcodeIcon className="h-3.5 w-3.5" />
                    {p.barcode}
                  </span>
                )}
                {p.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    Shelf: {p.location}
                  </span>
                )}
                {p.expiry && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Expiry: {p.expiry}
                  </span>
                )}
              </div>
            </div>

            {/* Price Economics Strip */}
            <div className="flex items-center gap-3 bg-surface p-2.5 rounded-2xl border border-border/80 shadow-xs">
              <div className="text-right px-2">
                <p className="text-[10px] uppercase font-bold text-text-secondary">Cost Price</p>
                <p className="font-mono text-xs font-semibold text-text-primary">
                  {formatCurrency(p.purchasePrice)}
                </p>
              </div>
              <div className="h-6 w-px bg-border/80" />
              <div className="text-right px-2">
                <p className="text-[10px] uppercase font-bold text-text-secondary">Sale Price</p>
                <p className="font-mono text-xs font-bold text-brand">
                  {formatCurrency(p.salePrice)}
                </p>
              </div>
              <div className="h-6 w-px bg-border/80" />
              <div className="text-right px-2">
                <p className="text-[10px] uppercase font-bold text-text-secondary">Margin</p>
                <p className="font-mono text-xs font-bold text-success">
                  +{s.marginPercent}%
                </p>
              </div>
            </div>
          </div>

          {/* KPI Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <KPICard
              title="Units Sold"
              value={`${s.totalUnitsSold} units`}
              subtitle={s.totalUnitsReturned > 0 ? `${s.netUnitsSold} net after returns` : "In audit period"}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <KPICard
              title="Sales Revenue"
              value={formatCurrency(s.totalRevenue)}
              subtitle={`Avg: ${formatCurrency(s.averageUnitPrice)}/unit`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KPICard
              title="Net Profit"
              value={formatCurrency(s.totalProfit)}
              subtitle={`${s.marginPercent}% gross margin`}
              icon={<DollarSign className="h-4 w-4" />}
              valueClassName="text-success font-bold"
            />
            <KPICard
              title="Customer Returns"
              value={`${s.totalUnitsReturned} units`}
              subtitle={formatCurrency(s.totalRefundAmount)}
              icon={<Undo2 className="h-4 w-4" />}
              valueClassName={s.totalUnitsReturned > 0 ? "text-danger" : ""}
            />
            <KPICard
              title="Current Stock"
              value={`${p.stockQty} units`}
              subtitle={`Value: ${formatCurrency(s.stockValuation)}`}
              icon={<Boxes className="h-4 w-4" />}
            />
            <KPICard
              title="Profit Margin"
              value={`${s.marginPercent}%`}
              subtitle={`Markup: ${p.markupPercent}%`}
              icon={<Percent className="h-4 w-4" />}
              valueClassName="text-brand font-bold"
            />
          </div>

          {/* Section Segment Tabs: Sales History vs Batches vs Purchases */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-border/80 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("sales")}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === "sales"
                    ? "bg-[#3612B8] text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                )}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>Sales Transactions ({reportData.salesHistory.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("batches")}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === "batches"
                    ? "bg-[#3612B8] text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                )}
              >
                <Boxes className="h-3.5 w-3.5" />
                <span>Active Batches ({reportData.batches.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("purchases")}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === "purchases"
                    ? "bg-[#3612B8] text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                )}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Inward Purchases ({reportData.stockPurchases.length})</span>
              </button>
            </div>

            {/* Active Table Content */}
            {activeTab === "sales" && (
              <div className="space-y-2">
                <DataTable
                  columns={salesColumns}
                  data={reportData.salesHistory}
                  keyExtractor={(item: any) => item.id}
                  emptyMessage="No sales transactions recorded for this product in the selected date range."
                />
              </div>
            )}

            {activeTab === "batches" && (
              <div className="space-y-2">
                <DataTable
                  columns={batchColumns}
                  data={reportData.batches}
                  keyExtractor={(b: any) => b.id}
                  emptyMessage="No batch inventory tracked for this product."
                />
              </div>
            )}

            {activeTab === "purchases" && (
              <div className="space-y-2">
                <DataTable
                  columns={purchaseColumns}
                  data={reportData.stockPurchases}
                  keyExtractor={(sp: any) => sp.id}
                  emptyMessage="No stock purchase invoices recorded for this product."
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
