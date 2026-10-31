import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  Loader2,
  Calendar,
  RotateCcw,
  CheckCircle2,
  FileText,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Tag,
  ScanBarcode,
  X,
  Receipt,
  RotateCcw as ReturnIcon,
  ArrowUpDown,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import PrintPreviewDialog from "@/components/shared/PrintPreviewDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import ExportButton from "@/components/shared/ExportButton";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import { useDebounce } from "@/hooks/useDebounce";
import type { ReturnEntry, Sale, SaleItem, PrinterConfig } from "@/types";

type DateFilter = "all" | "today" | "week" | "month";

interface ReturnsProps {
  defaultMode?: "history" | "terminal";
  isStandaloneWindow?: boolean;
}

export default function Returns({
  defaultMode = "history",
  isStandaloneWindow = false,
}: ReturnsProps) {
  const queryClient = useQueryClient();
  const historySearchRef = useRef<HTMLInputElement>(null);
  const terminalSearchRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"history" | "terminal">(
    isStandaloneWindow ? "terminal" : defaultMode
  );

  // History search state
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const debouncedSearch = useDebounce(search, 300);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "refundAmount" ? "desc" : "desc");
    }
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit, sortBy, sortOrder]);

  // Terminal active return state
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [customRefundAmount, setCustomRefundAmount] = useState<string>("");
  const [isEditingRefund, setIsEditingRefund] = useState(false);

  // Terminal invoice search state
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<Sale[]>([]);
  const [searchingInvoice, setSearchingInvoice] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // Print Preview state
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [pendingReturnData, setPendingReturnData] = useState<ReturnEntry | null>(null);
  const [pendingSale, setPendingSale] = useState<Sale | null>(null);

  // Read-only return details dialog in history view
  const [selectedReturn, setSelectedReturn] = useState<ReturnEntry | null>(null);

  // Queries
  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["returns", page, limit, debouncedSearch, sortBy, sortOrder],
    queryFn: () => api.returns.listPaginated({ page, limit, search: debouncedSearch, sortBy, sortOrder }),
  });

  const returns = paginatedData?.data || [];
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: recentSales = [], isLoading: loadingRecent } = useQuery({
    queryKey: ["sales", "recent"],
    queryFn: () => api.sales.listRecent(12),
    enabled: mode === "terminal" && !selectedSaleId,
  });

  const { data: selectedSale, isLoading: loadingSale } = useQuery({
    queryKey: ["sale", selectedSaleId],
    queryFn: () => api.sales.getById(selectedSaleId),
    enabled: !!selectedSaleId,
  });

  // Calculate return status for selected sale
  const hasReturns = (selectedSale?.return_count ?? 0) > 0;
  const fullyReturned =
    (selectedSale?.items?.length ?? 0) > 0 &&
    (selectedSale?.items ?? []).every((i: SaleItem) => i.quantity - (i.returned_qty ?? 0) <= 0);

  // Auto-focus search input when terminal view is active and no invoice is selected
  useEffect(() => {
    if (mode === "terminal" && !selectedSaleId) {
      const timer = setTimeout(() => {
        terminalSearchRef.current?.focus();
        terminalSearchRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [mode, selectedSaleId]);

  // Global keyboard shortcuts for returns desk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSaleId) {
          e.preventDefault();
          setSelectedSaleId("");
          setReturnQtys({});
          setError("");
          setCustomRefundAmount("");
          setIsEditingRefund(false);
          setTimeout(() => terminalSearchRef.current?.focus(), 60);
        } else if (mode === "terminal" && !isStandaloneWindow) {
          e.preventDefault();
          setMode("history");
        }
      } else if (
        (e.key === "F4" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n")) &&
        !isStandaloneWindow
      ) {
        e.preventDefault();
        if (mode === "history") {
          setMode("terminal");
        } else {
          terminalSearchRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, selectedSaleId, isStandaloneWindow]);

  function getDateRange(filter: DateFilter): { from?: string; to?: string } {
    const now = new Date();
    const to = now.toISOString().split("T")[0];
    if (filter === "today") return { from: to, to };
    if (filter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      return { from: weekAgo, to };
    }
    if (filter === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
      return { from: monthAgo, to };
    }
    return {};
  }

  const searchInvoices = useCallback(async (q: string, filter: DateFilter) => {
    const query = q.trim();
    if (!query && filter === "all") {
      setInvoiceResults([]);
      return;
    }
    setSearchingInvoice(true);
    try {
      const dateRange = getDateRange(filter);
      if (query) {
        const results = await api.sales.search(query);
        let filtered = results;
        if (dateRange.from) {
          filtered = results.filter((s) => {
            const d = s.created_at.split("T")[0];
            return d >= dateRange.from! && d <= dateRange.to!;
          });
        }
        setInvoiceResults(filtered);
      } else {
        const results = await api.sales.listAll({ dateFrom: dateRange.from, dateTo: dateRange.to });
        setInvoiceResults(results.slice(0, 30));
      }
    } catch {
      setInvoiceResults([]);
    } finally {
      setSearchingInvoice(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setInvoiceSearch(value);
    searchInvoices(value, dateFilter);
  }

  function handleDateFilterChange(filter: DateFilter) {
    setDateFilter(filter);
    searchInvoices(invoiceSearch, filter);
  }

  function selectSale(sale: Sale) {
    setSelectedSaleId(sale.id);
    setReturnQtys({});
    setError("");
    setCustomRefundAmount("");
    setIsEditingRefund(false);
  }

  // Barcode scanner handles Enter immediately
  async function handleInvoiceSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const query = invoiceSearch.trim();
    if (!query) return;

    // Check if already 1 result matches
    if (invoiceResults.length === 1) {
      selectSale(invoiceResults[0]);
      setInvoiceResults([]);
      setInvoiceSearch("");
      return;
    }

    const exact = invoiceResults.find(
      (s) => s.id.toLowerCase() === query.toLowerCase()
    );
    if (exact) {
      selectSale(exact);
      setInvoiceResults([]);
      setInvoiceSearch("");
      return;
    }

    // Direct scanner fallback query if typed rapidly
    try {
      setSearchingInvoice(true);
      const results = await api.sales.search(query);
      if (results.length === 1) {
        selectSale(results[0]);
        setInvoiceResults([]);
        setInvoiceSearch("");
      } else if (results.length > 0) {
        setInvoiceResults(results);
      } else {
        toast.error(`No sales found for "${query}"`);
      }
    } catch {
      toast.error("Error searching invoices");
    } finally {
      setSearchingInvoice(false);
    }
  }

  // Financial calculations
  function calcRefundAmount(): number {
    if (!selectedSale?.items) return 0;
    const discountRatio =
      selectedSale.subtotal > 0 ? selectedSale.discount / selectedSale.subtotal : 0;
    return Object.entries(returnQtys).reduce((sum, [id, qty]) => {
      const item = selectedSale.items?.find((i: SaleItem) => i.product_id === id);
      if (!item) return sum;
      const rawAmount = item.unit_price * qty;
      const discountedAmount = rawAmount * (1 - discountRatio);
      return sum + Math.round(discountedAmount);
    }, 0);
  }

  function calcRawRefundAmount(): number {
    if (!selectedSale?.items) return 0;
    return Object.entries(returnQtys).reduce((sum, [id, qty]) => {
      const item = selectedSale.items?.find((i: SaleItem) => i.product_id === id);
      return sum + (item?.unit_price || 0) * qty;
    }, 0);
  }

  function handleUpdateQty(productId: string, requestedQty: number, maxAllowed: number) {
    if (requestedQty > maxAllowed) {
      toast.warning(
        `Cannot return more than ${maxAllowed} (customer purchased ${maxAllowed} eligible units)`
      );
      setReturnQtys((prev) => ({
        ...prev,
        [productId]: maxAllowed,
      }));
      return;
    }
    const clamped = Math.max(0, requestedQty);
    setReturnQtys((prev) => {
      const next = { ...prev };
      if (clamped === 0) {
        delete next[productId];
      } else {
        next[productId] = clamped;
      }
      return next;
    });
  }

  function handleReturnAll() {
    if (!selectedSale?.items) return;
    const allQtys: Record<string, number> = {};
    for (const item of selectedSale.items) {
      const remaining = Math.max(0, item.quantity - (item.returned_qty ?? 0));
      if (remaining > 0) {
        allQtys[item.product_id] = remaining;
      }
    }
    setReturnQtys(allQtys);
    toast.info("Selected all eligible items for return");
  }

  function handleClearSale() {
    setSelectedSaleId("");
    setReturnQtys({});
    setError("");
    setCustomRefundAmount("");
    setIsEditingRefund(false);
    setTimeout(() => terminalSearchRef.current?.focus(), 60);
  }

  // Open separate window in Electron or Browser
  const handleOpenSeparateWindow = async () => {
    try {
      if (window.openReturnWindow) {
        const result = await window.openReturnWindow();
        if (!result.success) {
          toast.error(result.error || "Could not open returns window");
        }
      } else {
        window.open("/#/returns/terminal?standalone=1", "_blank", "width=1440,height=900");
      }
    } catch {
      window.open("/#/returns/terminal?standalone=1", "_blank", "width=1440,height=900");
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSale?.items) throw new Error("Sale items not loaded");
      const saleItems = selectedSale.items;
      const discountRatio =
        selectedSale.subtotal > 0 ? selectedSale.discount / selectedSale.subtotal : 0;
      const items = Object.entries(returnQtys)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantity]) => {
          const item = saleItems.find((i: SaleItem) => i.product_id === productId);
          const rawAmount = (item?.unit_price || 0) * quantity;
          const discountedAmount = rawAmount * (1 - discountRatio);
          return {
            productId,
            productName: item?.product_name || "",
            quantity,
            refundAmount: Math.round(discountedAmount),
          };
        });
      const calculatedRefund = items.reduce((s, i) => s + i.refundAmount, 0);
      const finalRefund = customRefundAmount !== "" ? Number(customRefundAmount) : calculatedRefund;
      return api.returns.create({
        saleId: selectedSaleId,
        refundAmount: finalRefund,
        reason,
        items,
      });
    },
    onSuccess: (returnData) => {
      toast.success("Return processed successfully");
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });

      setPendingReturnData(returnData);
      if (selectedSale) setPendingSale(selectedSale);
      setShowPrintPreview(true);

      // Reset workbench for next return
      setSelectedSaleId("");
      setReason("");
      setReturnQtys({});
      setError("");
      setCustomRefundAmount("");
      setIsEditingRefund(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setError(err instanceof Error ? err.message : "Failed to process return");
    },
  });

  const generateReturnHtml = useCallback(
    async (paperSize: string): Promise<string> => {
      if (!pendingReturnData || !pendingSale) return "";
      const printPayload = {
        ...pendingReturnData,
        items: pendingReturnData.items || [],
        reason: pendingReturnData.reason,
      };
      const result = await window.generateReturnReceiptHTML(printPayload, pendingSale, paperSize);
      return result.success ? result.html : "";
    },
    [pendingReturnData, pendingSale]
  );

  async function handlePrintReturn(config: PrinterConfig) {
    if (!pendingReturnData || !pendingSale) return;
    const printPayload = {
      ...pendingReturnData,
      items: pendingReturnData.items || [],
      reason: pendingReturnData.reason,
    };
    const result = await window.printReturnReceipt(printPayload, pendingSale, config);
    if (!result.success) {
      throw new Error(result.error || "Print failed");
    }
  }

  function getStatusBadge(sale: Sale) {
    const rc = sale.return_count ?? 0;
    if (rc === 0)
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
          <CheckCircle2 className="h-3 w-3" /> Full Sale
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
        <RotateCcw className="h-3 w-3" /> Partial Returns
      </span>
    );
  }

  const columns = [
    {
      key: "created_at",
      sortKey: "createdAt",
      sortable: true,
      header: "Date & Time",
      cell: (r: ReturnEntry) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatDateTime(r.created_at)}
        </span>
      ),
    },
    {
      key: "sale_id",
      header: "Sale ID",
      cell: (r: ReturnEntry) => (
        <span className="font-mono text-xs font-semibold text-brand">{r.sale_id}</span>
      ),
    },
    {
      key: "customer_name",
      header: "Customer",
      cell: (r: ReturnEntry) => (
        <span className="text-text-primary font-medium">{r.customer_name || "Walk-in Customer"}</span>
      ),
    },
    {
      key: "refund_amount",
      sortKey: "refundAmount",
      sortable: true,
      header: "Refund Amount",
      cell: (r: ReturnEntry) => (
        <span className="font-mono font-bold text-danger">{formatCurrency(r.refund_amount)}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (r: ReturnEntry) => (
        <span className="text-text-secondary text-xs">{r.reason || "—"}</span>
      ),
    },
  ];

  function handleExportPDF() {
    downloadPDF(
      `returns_${new Date().toISOString().split("T")[0]}.pdf`,
      "Returns List",
      ["Date", "Sale ID", "Customer", "Refund Amount", "Reason"],
      returns.map((r: ReturnEntry) => [
        r.created_at,
        r.sale_id,
        r.customer_name || "",
        r.refund_amount,
        r.reason,
      ])
    );
  }

  function handleExportCSV() {
    downloadCSV(
      `returns_${new Date().toISOString().split("T")[0]}.csv`,
      ["Date", "Sale ID", "Customer", "Refund Amount", "Reason"],
      returns.map((r: ReturnEntry) => [
        r.created_at,
        r.sale_id,
        r.customer_name || "",
        r.refund_amount,
        r.reason,
      ])
    );
  }

  useModuleShortcuts({
    onAdd: () => setMode("terminal"),
    onSearch: () => {
      if (mode === "history") historySearchRef.current?.focus();
      else terminalSearchRef.current?.focus();
    },
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  // Calculate discount figures for selected sale
  const originalSubtotal = selectedSale?.subtotal || 0;
  const originalDiscount = selectedSale?.discount || 0;
  const originalTotal = selectedSale?.total || 0;
  const discountRatio = originalSubtotal > 0 ? originalDiscount / originalSubtotal : 0;
  const discountPercentage = (discountRatio * 100).toFixed(1);

  const rawRefundAmount = calcRawRefundAmount();
  const calculatedRefund = calcRefundAmount();
  const discountDeducted = rawRefundAmount - calculatedRefund;
  const finalRefund = customRefundAmount !== "" ? Number(customRefundAmount) : calculatedRefund;
  const hasItemsToReturn = Object.values(returnQtys).some((q) => q > 0);

  // =========================================================================
  // VIEW: DEDICATED RETURN TERMINAL WORKBENCH (NO MODAL)
  // =========================================================================
  if (mode === "terminal") {
    return (
      <div className="space-y-5 pb-12 animate-in fade-in duration-200">
        {/* Terminal Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 sm:p-5 rounded-2xl border border-border/80 shadow-xs">
          <div className="flex items-center gap-3">
            {!isStandaloneWindow && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMode("history");
                  setSelectedSaleId("");
                }}
                className="rounded-xl shadow-xs hover:bg-surface-2 transition-all font-semibold"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to History <kbd className="ml-1.5 font-mono text-[10px] text-text-secondary">Esc</kbd>
              </Button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-text-primary">
                  Returns & Refund Terminal
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-md bg-brand/10 text-brand font-mono font-bold">
                  Desk
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Scan medicine barcode, select invoice, and issue accurate discounted refunds
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStandaloneWindow && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSeparateWindow}
                className="rounded-xl shadow-xs text-xs font-semibold"
                title="Pop out into an independent window (like POS)"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-brand" />
                Open in Separate Window
              </Button>
            )}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-text-secondary bg-surface-2 px-3 py-1.5 rounded-xl border border-border">
              <ScanBarcode className="h-3.5 w-3.5 text-brand" /> Direct Scanner Active
            </span>
          </div>
        </div>

        {/* WORKBENCH STATE 1: NO INVOICE SELECTED (OMNI-SEARCH & SCANNER) */}
        {!selectedSaleId && (
          <div className="space-y-5">
            {/* Omni-Search Box with Auto-Focus */}
            <div className="rounded-2xl border-2 border-brand/30 bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <ScanBarcode className="h-4 w-4 text-brand" />
                  Omni-Search Barcode or Invoice
                </Label>
                <span className="text-[11px] font-mono text-brand font-medium">
                  Auto-focused • Press Enter to select
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-brand" />
                <Input
                  ref={terminalSearchRef}
                  autoFocus
                  placeholder="Scan medicine barcode, or type invoice #, customer name, medicine name..."
                  value={invoiceSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleInvoiceSearchKeyDown}
                  className="pl-12 pr-10 h-13 text-sm sm:text-base rounded-xl border-border/80 bg-surface shadow-xs focus-visible:ring-2 focus-visible:ring-brand font-medium"
                />
                {invoiceSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceSearch("");
                      setInvoiceResults([]);
                      terminalSearchRef.current?.focus();
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Date Filters (Only shown when searching or browsing recent) */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-text-secondary mr-1" />
                  <span className="text-xs text-text-secondary font-medium mr-1">Period:</span>
                  {(["all", "today", "week", "month"] as DateFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => handleDateFilterChange(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        dateFilter === f
                          ? "bg-brand text-white shadow-xs"
                          : "bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-2/80"
                      }`}
                    >
                      {f === "all"
                        ? "All Time"
                        : f === "today"
                          ? "Today"
                          : f === "week"
                            ? "This Week"
                            : "This Month"}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-text-secondary flex items-center gap-1">
                  {searchingInvoice ? (
                    <span className="flex items-center gap-1.5 text-brand font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching matching invoices...
                    </span>
                  ) : (
                    <span>💡 Tip: Scan a barcode to fetch all invoices containing that product</span>
                  )}
                </div>
              </div>
            </div>

            {/* Results Grid / List */}
            {invoiceSearch.trim() ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-text-primary">
                    Search Results ({invoiceResults.length} invoices found)
                  </h2>
                  <span className="text-xs text-text-secondary">Click any invoice to process return</span>
                </div>

                {invoiceResults.length === 0 && !searchingInvoice ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-surface space-y-2">
                    <AlertCircle className="h-8 w-8 text-text-secondary mx-auto opacity-50" />
                    <p className="text-sm font-semibold text-text-primary">
                      No invoices found for "{invoiceSearch}"
                    </p>
                    <p className="text-xs text-text-secondary max-w-sm mx-auto">
                      Make sure the barcode, invoice number, or product name is correct, or adjust the date filter.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {invoiceResults.map((sale) => (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => selectSale(sale)}
                        className="text-left rounded-2xl border border-border/80 bg-surface p-4 hover:border-brand/60 hover:shadow-md transition-all group cursor-pointer relative space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-brand group-hover:underline">
                                #{sale.id}
                              </span>
                              {getStatusBadge(sale)}
                            </div>
                            <p className="text-xs font-medium text-text-primary mt-1">
                              {sale.customer_name || "Walk-in Customer"}
                            </p>
                            <p className="text-[11px] text-text-secondary">
                              {formatDateTime(sale.created_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-sm font-bold text-text-primary block">
                              {formatCurrency(sale.total)}
                            </span>
                            {sale.discount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                <Tag className="h-2.5 w-2.5" /> -{formatCurrency(sale.discount)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Matched product preview if available */}
                        {sale.items && sale.items.length > 0 && (
                          <div className="pt-2 border-t border-border/60 text-xs space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                              Items Sold ({sale.items.length}):
                            </span>
                            <div className="text-[11px] text-text-secondary truncate">
                              {sale.items.map((i: SaleItem) => i.product_name).join(", ")}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-end text-xs font-semibold text-brand group-hover:translate-x-0.5 transition-transform">
                          <span>Select Invoice</span>
                          <ChevronRight className="h-4 w-4 ml-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* When no search query: Show Recent Sales directly */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand" />
                    Recent Invoices (Click to return)
                  </h2>
                  <span className="text-xs text-text-secondary">Showing latest pharmacy sales</span>
                </div>

                {loadingRecent ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : recentSales.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-surface">
                    <p className="text-sm text-text-secondary">No recent sales found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {recentSales.map((sale: Sale) => (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => selectSale(sale)}
                        className="text-left rounded-2xl border border-border/80 bg-surface p-4 hover:border-brand/60 hover:shadow-md transition-all group cursor-pointer space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-brand group-hover:underline">
                                #{sale.id}
                              </span>
                              {getStatusBadge(sale)}
                            </div>
                            <p className="text-xs font-medium text-text-primary mt-1">
                              {sale.customer_name || "Walk-in Customer"}
                            </p>
                            <p className="text-[11px] text-text-secondary">
                              {formatDateTime(sale.created_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-sm font-bold text-text-primary block">
                              {formatCurrency(sale.total)}
                            </span>
                            {sale.discount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                <Tag className="h-2.5 w-2.5" /> -{formatCurrency(sale.discount)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60 text-text-secondary">
                          <span>{formatDate(sale.created_at)}</span>
                          <span className="font-semibold text-brand flex items-center group-hover:translate-x-0.5 transition-transform">
                            Select Invoice <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WORKBENCH STATE 2: INVOICE SELECTED (TABS ARE HIDDEN! FULL WORKBENCH ACTIVE) */}
        {selectedSaleId && (
          <div className="space-y-5 animate-in fade-in-50 duration-200">
            {/* Top Selected Invoice Status Bar */}
            <div className="rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                  <Receipt className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base sm:text-lg font-bold text-text-primary">
                      Invoice #{selectedSale?.id}
                    </span>
                    {selectedSale && getStatusBadge(selectedSale)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary mt-0.5">
                    <span>
                      Customer:{" "}
                      <strong className="text-text-primary">
                        {selectedSale?.customer_name || "Walk-in Customer"}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Date:{" "}
                      <strong className="text-text-primary">
                        {selectedSale && formatDateTime(selectedSale.created_at)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSale}
                  className="rounded-xl shadow-xs text-xs font-semibold hover:text-danger hover:border-danger/30"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Change / Scan Another Invoice <kbd className="ml-1 text-[10px]">Esc</kbd>
                </Button>
              </div>
            </div>

            {loadingSale ? (
              <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </div>
            ) : selectedSale ? (
              <div className="space-y-5">
                {/* PROMINENT DISCOUNT INTELLIGENCE CARD */}
                {originalDiscount > 0 ? (
                  <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm sm:text-base">
                        <Tag className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                          ORIGINAL SALE HAD {formatCurrency(originalDiscount)} DISCOUNT ({discountPercentage}% OFF)
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200">
                        Proportional Discount Protection Active
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-amber-500/20 text-text-secondary">
                      <div className="bg-surface/60 p-2.5 rounded-xl border border-border/50">
                        <span className="block text-[11px] text-text-secondary">Original Subtotal</span>
                        <span className="font-mono font-bold text-text-primary text-sm">
                          {formatCurrency(originalSubtotal)}
                        </span>
                      </div>
                      <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        <span className="block text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                          Total Discount Given
                        </span>
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                          -{formatCurrency(originalDiscount)}
                        </span>
                      </div>
                      <div className="bg-surface/60 p-2.5 rounded-xl border border-border/50">
                        <span className="block text-[11px] text-text-secondary">Net Cash Paid by Customer</span>
                        <span className="font-mono font-bold text-text-primary text-sm">
                          {formatCurrency(originalTotal)}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed pt-1">
                      ⚠️ <strong>Attention Admin:</strong> This customer received a {discountPercentage}% discount on this sale. 
                      When returning items, the system automatically deducts {discountPercentage}% proportionally from returned items 
                      so you <strong>DO NOT refund full un-discounted cash</strong>!
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs flex flex-wrap items-center justify-between gap-3 text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        <strong>Standard Sale (No Discount):</strong> This invoice had 0 PKR discount. 
                        100% full item prices apply to refunds.
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sm">
                      Total: {formatCurrency(originalTotal)}
                    </span>
                  </div>
                )}

                {/* Fully Returned Notification */}
                {fullyReturned && (
                  <div className="rounded-2xl border-2 border-danger/30 bg-danger/5 p-4 text-danger text-sm flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>
                      <strong>Invoice Fully Returned:</strong> All items in this invoice have already been returned. No items remaining for restitution.
                    </span>
                  </div>
                )}

                {/* DUAL COLUMN WORKBENCH */}
                {!fullyReturned && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Column (8 cols): Items Table */}
                    <div className="lg:col-span-8 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-text-primary">
                            Items in this Invoice
                          </h3>
                          <p className="text-xs text-text-secondary">
                            Specify return quantities below (type numbers or use stepper buttons)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleReturnAll}
                            className="rounded-xl text-xs font-semibold text-brand hover:text-brand"
                          >
                            Return All Eligible Items
                          </Button>
                          {hasItemsToReturn && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setReturnQtys({})}
                              className="rounded-xl text-xs text-text-secondary hover:text-danger"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Items Table Card */}
                      <div className="rounded-2xl border border-border/80 bg-surface shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-border bg-surface-2/60 text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                                <th className="py-3 px-4">Medicine & Details</th>
                                <th className="py-3 px-3 text-center">Purchased</th>
                                <th className="py-3 px-3 text-center">Eligible</th>
                                <th className="py-3 px-3 text-right">Unit Price</th>
                                {originalDiscount > 0 && (
                                  <th className="py-3 px-3 text-right text-amber-700 dark:text-amber-400">
                                    Refund Rate
                                  </th>
                                )}
                                <th className="py-3 px-4 text-center">Return Qty</th>
                                <th className="py-3 px-4 text-right">Line Refund</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60 text-xs">
                              {selectedSale.items?.map((item: SaleItem) => {
                                const returnedQty = item.returned_qty ?? 0;
                                const remaining = Math.max(0, item.quantity - returnedQty);
                                const qty = returnQtys[item.product_id] || 0;
                                const rawItemSubtotal = item.unit_price * qty;
                                const discountedItemSubtotal = Math.round(
                                  rawItemSubtotal * (1 - discountRatio)
                                );
                                const netUnitRate = Math.round(item.unit_price * (1 - discountRatio));

                                return (
                                  <tr
                                    key={item.product_id}
                                    className={`transition-colors ${
                                      qty > 0 ? "bg-brand/[0.03]" : "hover:bg-surface-2/40"
                                    }`}
                                  >
                                    {/* Product details */}
                                    <td className="py-3 px-4 min-w-[200px]">
                                      <p className="font-semibold text-text-primary text-sm">
                                        {item.product_name}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary mt-0.5">
                                        {item.barcode && <span>Code: {item.barcode}</span>}
                                        {item.batch_number && <span>• Batch: {item.batch_number}</span>}
                                        {item.expiry && <span>• Exp: {item.expiry}</span>}
                                      </div>
                                      {returnedQty > 0 && (
                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                                          ✓ {returnedQty} unit(s) previously returned
                                        </span>
                                      )}
                                    </td>

                                    {/* Purchased */}
                                    <td className="py-3 px-3 text-center font-mono font-bold">
                                      {item.quantity}
                                    </td>

                                    {/* Eligible */}
                                    <td className="py-3 px-3 text-center">
                                      <span
                                        className={`font-mono font-bold px-2 py-0.5 rounded-full text-xs ${
                                          remaining > 0
                                            ? "bg-brand/10 text-brand"
                                            : "bg-surface-2 text-text-secondary"
                                        }`}
                                      >
                                        {remaining}
                                      </span>
                                    </td>

                                    {/* Original unit price */}
                                    <td className="py-3 px-3 text-right font-mono">
                                      {formatCurrency(item.unit_price)}
                                    </td>

                                    {/* Net refund rate per unit (with discount deduction) */}
                                    {originalDiscount > 0 && (
                                      <td className="py-3 px-3 text-right">
                                        <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                                          {formatCurrency(netUnitRate)}
                                        </span>
                                        <span className="block text-[10px] text-text-secondary">
                                          (-{discountPercentage}%)
                                        </span>
                                      </td>
                                    )}

                                    {/* Return Qty Input + Stepper */}
                                    <td className="py-3 px-4 text-center">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQty(item.product_id, qty - 1, remaining)
                                          }
                                          disabled={qty <= 0}
                                          className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                          title="Decrease quantity"
                                        >
                                          <Minus className="h-3.5 w-3.5" />
                                        </button>

                                        <Input
                                          type="number"
                                          min={0}
                                          max={remaining}
                                          value={qty === 0 ? "" : qty}
                                          onChange={(e) => {
                                            const val = e.target.value.trim();
                                            if (val === "") {
                                              handleUpdateQty(item.product_id, 0, remaining);
                                              return;
                                            }
                                            const parsed = parseInt(val, 10);
                                            if (isNaN(parsed)) return;
                                            handleUpdateQty(item.product_id, parsed, remaining);
                                          }}
                                          placeholder="0"
                                          className="h-8 w-14 text-center font-mono text-sm font-bold p-1 rounded-lg border border-border/80 bg-surface shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus-visible:ring-2 focus-visible:ring-brand"
                                        />

                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQty(item.product_id, qty + 1, remaining)
                                          }
                                          disabled={qty >= remaining || remaining <= 0}
                                          className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                          title="Increase quantity"
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>

                                        {remaining > 0 && qty !== remaining && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateQty(item.product_id, remaining, remaining)
                                            }
                                            className="text-[10px] text-brand hover:underline font-bold px-1"
                                            title="Return all units for this item"
                                          >
                                            Max
                                          </button>
                                        )}
                                      </div>
                                    </td>

                                    {/* Line refund */}
                                    <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                                      {qty > 0 ? (
                                        <span className="text-danger">
                                          {formatCurrency(discountedItemSubtotal)}
                                        </span>
                                      ) : (
                                        <span className="text-text-secondary">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Right Column (4 cols): Settlement & Financial Audit Card */}
                    <div className="lg:col-span-4 space-y-4">
                      <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-xs space-y-4 sticky top-6">
                        <div className="flex items-center justify-between pb-3 border-b border-border/60">
                          <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
                            <ReturnIcon className="h-4 w-4 text-danger" />
                            Refund Settlement
                          </h3>
                          <span className="text-xs text-text-secondary font-mono">
                            {Object.values(returnQtys).filter((q) => q > 0).length} item(s) selected
                          </span>
                        </div>

                        {/* Financial Audit Breakdown */}
                        <div className="space-y-2.5 text-xs">
                          <div className="flex items-center justify-between text-text-secondary">
                            <span>Selected Items Gross Value</span>
                            <span className="font-mono font-semibold text-text-primary text-sm">
                              {formatCurrency(rawRefundAmount)}
                            </span>
                          </div>

                          {originalDiscount > 0 && discountDeducted > 0 && (
                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold">
                              <span>Sale Discount Deducted ({discountPercentage}%)</span>
                              <span className="font-mono text-sm">
                                -{formatCurrency(discountDeducted)}
                              </span>
                            </div>
                          )}

                          <div className="pt-3 border-t border-border flex items-baseline justify-between">
                            <div>
                              <span className="font-bold text-sm text-text-primary block">
                                Net Refund to Pay
                              </span>
                              <span className="text-[11px] text-text-secondary">
                                Accurate discounted restitution
                              </span>
                            </div>
                            <span className="font-mono text-2xl font-black text-danger">
                              {formatCurrency(finalRefund)}
                            </span>
                          </div>

                          {/* Manual Override Option */}
                          <div className="pt-1">
                            {isEditingRefund ? (
                              <div className="bg-surface-2 p-2.5 rounded-xl border border-border space-y-1.5">
                                <Label className="text-[11px]">Manual Override Amount (PKR)</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={customRefundAmount}
                                    onChange={(e) => setCustomRefundAmount(e.target.value)}
                                    className="h-8 font-mono font-bold text-danger text-sm"
                                    autoFocus
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => {
                                      setIsEditingRefund(false);
                                      setCustomRefundAmount("");
                                    }}
                                  >
                                    Reset
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomRefundAmount(String(calculatedRefund));
                                  setIsEditingRefund(true);
                                }}
                                className="text-[11px] text-text-secondary hover:text-brand underline cursor-pointer"
                              >
                                Need custom refund adjustment? Click here
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Reason Field */}
                        <div className="space-y-2 pt-3 border-t border-border/60">
                          <Label className="text-xs font-bold">Reason for Return (Optional)</Label>
                          <div className="flex flex-wrap gap-1">
                            {[
                              "Damaged / Broken",
                              "Expired Medicine",
                              "Wrong Item Sold",
                              "Customer Request",
                            ].map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => setReason(chip)}
                                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  reason === chip
                                    ? "bg-brand/10 border-brand text-brand font-bold"
                                    : "bg-surface-2 border-border text-text-secondary hover:text-text-primary"
                                }`}
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                          <Input
                            placeholder="e.g. Broken tablet strip, customer returned..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        {error && (
                          <p className="text-xs text-danger flex items-center gap-1.5 font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                          </p>
                        )}

                        {/* Submit Action Button */}
                        <Button
                          className="w-full h-12 text-sm font-bold bg-danger hover:bg-danger/90 text-white rounded-xl shadow-md cursor-pointer"
                          disabled={!hasItemsToReturn || createMutation.isPending}
                          onClick={() => createMutation.mutate()}
                        >
                          {createMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" /> Processing Return...
                            </span>
                          ) : (
                            <span>
                              Confirm Return & Refund ({formatCurrency(finalRefund)})
                            </span>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Print Preview for Thermal Return Receipt */}
        {showPrintPreview && pendingReturnData && pendingSale && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={(v) => {
              setShowPrintPreview(v);
              if (!v) {
                setPendingReturnData(null);
                setPendingSale(null);
              }
            }}
            title="Return Credit Receipt Preview"
            htmlGenerator={generateReturnHtml}
            onPrint={handlePrintReturn}
          />
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: RETURNS HISTORY LOG & REPORTING (DEFAULT MODE)
  // =========================================================================
  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Sales Returns & Refunds"
        description="Customer medicine returns, batch restitution, and cash refunds"
        action={{
          label: "Process Return Desk",
          onClick: () => setMode("terminal"),
          shortcut: "Mod+N",
        }}
      />

      {/* Toolbar & KPI Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
            <Input
              autoFocus
              ref={historySearchRef}
              placeholder="Search returns by customer, medicine, sale ID, or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
          <Select
            value={
              sortBy === "createdAt" && sortOrder === "desc"
                ? "recent"
                : sortBy === "createdAt" && sortOrder === "asc"
                ? "oldest"
                : sortBy === "refundAmount" && sortOrder === "desc"
                ? "refund_desc"
                : sortBy === "refundAmount" && sortOrder === "asc"
                ? "refund_asc"
                : "recent"
            }
            onValueChange={(val) => {
              if (val === "recent") {
                setSortBy("createdAt");
                setSortOrder("desc");
              } else if (val === "oldest") {
                setSortBy("createdAt");
                setSortOrder("asc");
              } else if (val === "refund_desc") {
                setSortBy("refundAmount");
                setSortOrder("desc");
              } else if (val === "refund_asc") {
                setSortBy("refundAmount");
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
              <SelectItem value="refund_desc">Highest Refund</SelectItem>
              <SelectItem value="refund_asc">Lowest Refund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenSeparateWindow}
            className="rounded-xl shadow-xs text-xs font-semibold"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-brand" />
            Open Separate Window
          </Button>
          <ExportButton type="csv" onClick={handleExportCSV} />
          <ExportButton type="pdf" onClick={handleExportPDF} />
        </div>
      </div>

      {/* History Table */}
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={returns}
          loading={isLoading}
          keyExtractor={(r: ReturnEntry) => r.id}
          onRowClick={(r: ReturnEntry) => setSelectedReturn(r)}
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

      {/* Read-Only Return Details Modal */}
      <Dialog
        open={!!selectedReturn}
        onOpenChange={(v) => {
          if (!v) setSelectedReturn(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Return Details</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="px-5 pb-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-text-secondary text-xs block">Sale ID</span>
                  <span className="font-mono font-bold text-brand">{selectedReturn.sale_id}</span>
                </div>
                <div>
                  <span className="text-text-secondary text-xs block">Customer</span>
                  <span className="font-medium">{selectedReturn.customer_name || "Walk-in"}</span>
                </div>
                <div>
                  <span className="text-text-secondary text-xs block">Date & Time</span>
                  <span>{formatDateTime(selectedReturn.created_at)}</span>
                </div>
                <div>
                  <span className="text-text-secondary text-xs block">Total Refund Paid</span>
                  <span className="font-mono font-bold text-danger">
                    {formatCurrency(selectedReturn.refund_amount)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-text-secondary text-xs block">Reason</span>
                  <span>{selectedReturn.reason || "—"}</span>
                </div>
              </div>

              {selectedReturn.items && selectedReturn.items.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <Label className="text-xs font-bold">Items Returned</Label>
                  <div className="border border-border rounded-xl divide-y divide-border text-xs overflow-hidden">
                    {selectedReturn.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-surface">
                        <span className="font-medium text-text-primary">
                          {item.product_name} × {item.quantity}
                        </span>
                        <span className="font-mono font-bold text-danger">
                          {formatCurrency(item.refund_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
