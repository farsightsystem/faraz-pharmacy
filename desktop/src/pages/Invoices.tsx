import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, Calendar, Printer, Eye, RotateCcw, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import ExportButton from "@/components/shared/ExportButton";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import StatusBadge from "@/components/shared/StatusBadge";
import PrintPreviewDialog from "@/components/shared/PrintPreviewDialog";
import type { Sale, PrinterConfig } from "@/types";

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Invoices() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [showProfitId, setShowProfitId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const debouncedSearch = useDebounce(search, 300);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "total" || key === "discount" ? "desc" : "desc");
    }
    setPage(1);
  };

  const handlePresetSelect = (preset: "all" | "today" | "week" | "month") => {
    setActivePreset(preset);
    setPage(1);
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
    }
  };

  const handleResetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setActivePreset("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, sortBy, sortOrder]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["invoices", page, limit, debouncedSearch, dateFrom, dateTo, sortBy, sortOrder],
    queryFn: () =>
      api.sales.listPaginated({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit,
        sortBy,
        sortOrder,
      }),
  });

  const sales = paginatedData?.data || [];
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const exportData = useCallback(() => {
    const headers = [
      "Sale ID",
      "Date",
      "Customer",
      "Items",
      "Subtotal",
      "Discount",
      "Total",
      "Paid",
      "Change",
      "Status",
    ];
    return sales.map((s: Sale) => [
      s.id,
      s.created_at,
      s.customer_name || "Walk-in",
      s.items?.length ?? 0,
      s.subtotal,
      s.discount,
      s.total,
      s.amount_paid,
      s.change,
      s.status,
    ]);
  }, [sales]);

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Sale ID",
      "Date",
      "Customer",
      "Items",
      "Subtotal",
      "Discount",
      "Total",
      "Paid",
      "Change",
      "Status",
    ];
    downloadCSV(`invoices_${dateFrom || "all"}_${dateTo || "all"}.csv`, headers, exportData());
  }, [exportData, dateFrom, dateTo]);

  const handleExportPDF = useCallback(() => {
    const headers = [
      "Sale ID",
      "Date",
      "Customer",
      "Items",
      "Subtotal",
      "Discount",
      "Total",
      "Paid",
      "Change",
      "Status",
    ];
    downloadPDF(
      `invoices_${dateFrom || "all"}_${dateTo || "all"}.pdf`,
      "Invoices & Billing",
      headers,
      exportData()
    );
  }, [exportData, dateFrom, dateTo]);

  const { searchRef } = useModuleShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  function handleQuickPrint(sale: Sale, e: React.MouseEvent) {
    e.stopPropagation();
    setPrintSale(sale);
  }

  const generateReceiptHtml = useCallback(
    async (paperSize: string): Promise<string> => {
      if (!printSale) return "";
      const printData = {
        ...printSale,
        customer_total_arrears: 0,
        items:
          printSale.items?.map((i) => ({
            product_name: i.product_name,
            batch_number: i.batch_number,
            expiry: i.expiry,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal,
          })) || [],
      };
      const result = await window.generateReceiptHTML(printData, paperSize);
      return result.success ? result.html : "";
    },
    [printSale]
  );

  async function handlePrint(config: PrinterConfig) {
    if (!printSale) return;
    const printData = {
      ...printSale,
      customer_total_arrears: 0,
      items:
        printSale.items?.map((i) => ({
          product_name: i.product_name,
          batch_number: i.batch_number,
          expiry: i.expiry,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        })) || [],
    };
    const result = await window.printReceipt(printData, config);
    if (!result.success) {
      throw new Error(result.error || "Print failed");
    }
  }

  const columns = [
    {
      key: "created_at",
      sortKey: "createdAt",
      sortable: true,
      header: "Date",
      cell: (s: Sale) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatDateTime(s.created_at)}
        </span>
      ),
    },
    {
      key: "id",
      header: "Invoice ID",
      cell: (s: Sale) => (
        <span className="font-mono text-xs text-text-secondary">{s.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: "customer_name",
      header: "Customer",
      cell: (s: Sale) => <span>{s.customer_name || "Walk-in"}</span>,
    },
    {
      key: "items",
      header: "Items",
      cell: (s: Sale) => (
        <span className="font-mono text-sm">{(s as any).item_count ?? s.items?.length ?? 0}</span>
      ),
    },
    {
      key: "total",
      sortKey: "total",
      sortable: true,
      header: "Total",
      cell: (s: Sale) => <span className="font-mono font-medium">{formatCurrency(s.total)}</span>,
    },
    {
      key: "amount_paid",
      header: "Paid",
      cell: (s: Sale) => <span className="font-mono">{formatCurrency(s.amount_paid)}</span>,
    },
    {
      key: "profit",
      header: "Profit",
      cell: (s: Sale) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowProfitId(showProfitId === s.id ? null : s.id);
          }}
          className={`font-mono font-medium cursor-pointer hover:underline ${(s.profit ?? 0) >= 0 ? "text-success" : "text-danger"}`}
        >
          {showProfitId === s.id ? formatCurrency(s.profit ?? 0) : "••••"}
        </button>
      ),
    },
    { key: "status", header: "Status", cell: (s: Sale) => <StatusBadge status={s.status} /> },
    {
      key: "actions",
      header: "",
      cell: (s: Sale) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/invoices/${s.id}`);
            }}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-brand hover:bg-brand/10 transition-colors"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => handleQuickPrint(s, e)}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-brand hover:bg-brand/10 transition-colors"
            title="Print Receipt"
          >
            <Printer className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Sales Invoices & Billing"
        description="Prescription sales receipts, customer invoices, and reprint records"
      />

      {/* Toolbar & Filters */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Bar & Sort */}
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
              <Input
                ref={searchRef}
                autoFocus
                placeholder="Search by invoice ID or customer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </div>
            <Select
              value={
                sortBy === "createdAt" && sortOrder === "desc"
                  ? "recent"
                  : sortBy === "createdAt" && sortOrder === "asc"
                  ? "oldest"
                  : sortBy === "total" && sortOrder === "desc"
                  ? "total_desc"
                  : sortBy === "total" && sortOrder === "asc"
                  ? "total_asc"
                  : "recent"
              }
              onValueChange={(val) => {
                if (val === "recent") {
                  setSortBy("createdAt");
                  setSortOrder("desc");
                } else if (val === "oldest") {
                  setSortBy("createdAt");
                  setSortOrder("asc");
                } else if (val === "total_desc") {
                  setSortBy("total");
                  setSortOrder("desc");
                } else if (val === "total_asc") {
                  setSortBy("total");
                  setSortOrder("asc");
                }
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[145px] h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs shrink-0">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-text-secondary shrink-0" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="total_desc">Highest Total</SelectItem>
                <SelectItem value="total_asc">Lowest Total</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export Actions & Reset */}
          <div className="flex items-center gap-2">
            {(search || dateFrom || dateTo || activePreset !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-danger bg-danger/10 hover:bg-danger/15 rounded-xl border border-danger/20 transition-all cursor-pointer active:scale-95"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
            <ExportButton type="csv" onClick={handleExportCSV} disabled={sales.length === 0} />
            <ExportButton type="pdf" onClick={handleExportPDF} disabled={sales.length === 0} />
          </div>
        </div>

        {/* Date Filter Bar: Quick Presets + Distinct Custom Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl bg-surface border border-border/80 shadow-xs">
          {/* Quick Preset Tabs */}
          <div className="flex items-center gap-1 bg-surface-2/60 p-1 rounded-xl border border-border/40">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handlePresetSelect(tab.id as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                  activePreset === tab.id
                    ? "bg-[#3612B8] dark:bg-[#754BFB] text-white shadow-xs font-bold"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Pickers with Spacing */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border/50">
              <Calendar className="h-3.5 w-3.5 text-[#3612B8] dark:text-[#754BFB] shrink-0" />
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset("custom");
                  setPage(1);
                }}
                className="bg-transparent text-xs text-text-primary font-medium outline-none cursor-pointer"
              />
            </div>

            <span className="text-text-tertiary text-xs font-bold px-0.5">to</span>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border/50">
              <Calendar className="h-3.5 w-3.5 text-[#3612B8] dark:text-[#754BFB] shrink-0" />
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset("custom");
                  setPage(1);
                }}
                className="bg-transparent text-xs text-text-primary font-medium outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={sales}
          loading={isLoading}
          keyExtractor={(s: Sale) => s.id}
          onRowClick={(s: Sale) => navigate(`/invoices/${s.id}`)}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
        
        {/* Pagination Bar */}
        <div className="rounded-2xl border border-border/80 bg-surface p-3 px-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>
              Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1} to{" "}
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries
            </span>
            <div className="flex items-center gap-2">
              <span>Per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-surface-2 text-text-primary border border-border rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
              >
                {[10, 20, 30, 50, 100].map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl shadow-xs"
            >
              Previous
            </Button>
            <div className="text-xs font-semibold text-text-primary px-2">
              Page {meta.page} of {meta.totalPages || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= (meta.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl shadow-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {printSale && (
        <PrintPreviewDialog
          open={!!printSale}
          onOpenChange={(v) => {
            if (!v) setPrintSale(null);
          }}
          title="Invoice Receipt"
          htmlGenerator={generateReceiptHtml}
          onPrint={handlePrint}
        />
      )}
    </div>
  );
}
