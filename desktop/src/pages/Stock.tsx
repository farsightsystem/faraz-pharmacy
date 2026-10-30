import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Eye,
  EyeOff,
  Barcode,
  Search,
  Download,
  Archive,
  ShieldAlert,
  Sparkles,
  FileText,
  ArrowUpDown,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF, downloadExcel } from "@/lib/export";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import ExportButton from "@/components/shared/ExportButton";
import { ShortcutHint } from "@/components/shared/Kbd";
import BatchTraceDialog from "@/components/stock/BatchTraceDialog";
import type { StockPurchase, Product, Distributor } from "@/types";

export default function Stock() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showValue, setShowValue] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [traceBatchOpen, setTraceBatchOpen] = useState(false);
  const [traceBatchNumber, setTraceBatchNumber] = useState("");
  const [search, setSearch] = useState("");
  const [toolbarScan, setToolbarScan] = useState("");
  const [scanValue, setScanValue] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const isSavingAndNextRef = useRef(false);
  const [invoiceMode, setInvoiceMode] = useState<"recent" | "new">("recent");
  const [form, setForm] = useState({
    productId: "",
    distributorId: "",
    invoiceNumber: "",
    batchNumber: "",
    quantity: "",
    stax: "",
    expiry: "",
    priceTierId: "" as string | null,
  });

  const stockHeaders = [
    "Invoice",
    "Batch #",
    "Date",
    "Supplier",
    "Product",
    "Qty",
    "Purchase Price",
    "STAX",
    "Total",
    "Status",
  ];
  const stockExportRows = (data: StockPurchase[]) =>
    data.map((s) => [
      s.invoice_number || "—",
      s.batch_number || "—",
      formatDate(s.created_at),
      s.distributor_name || "—",
      s.product_name,
      s.quantity,
      formatCurrency(s.purchase_price),
      s.stax ? formatCurrency(s.stax) : "—",
      formatCurrency(s.total_value),
      s.active !== 0 ? "Active" : "Archived",
    ]);

  function handleExportPDF() {
    downloadPDF(
      `stock_${new Date().toISOString().split("T")[0]}.pdf`,
      "Stock / Purchases",
      stockHeaders,
      stockExportRows(stockEntries)
    );
  }

  function handleExportCSV() {
    downloadCSV(
      `stock_${new Date().toISOString().split("T")[0]}.csv`,
      stockHeaders,
      stockExportRows(stockEntries)
    );
  }

  const { searchRef } = useModuleShortcuts({
    onAdd: () => openAdd(),
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

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
      setSortOrder(key === "productName" ? "asc" : "desc");
    }
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, showArchived, limit, sortBy, sortOrder]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["stock", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.stock.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        archived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const rawStock = paginatedData?.data || [];
  const stockEntries = rawStock.filter((s: StockPurchase) =>
    showArchived ? s.active === 0 : s.active !== 0
  );
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products.list });
  const { data: distributorsResponse } = useQuery({
    queryKey: ["distributors"],
    queryFn: () => api.distributors.listPaginated({ limit: 1000 }),
  });
  const distributors = distributorsResponse?.data ?? [];

  const { data: recentPurchasesData } = useQuery({
    queryKey: ["recent-stock-purchases"],
    queryFn: () => api.stock.listPaginated({ limit: 100, archived: false }),
    staleTime: 1000 * 30,
  });

  const recentInvoices = useMemo(() => {
    const list: StockPurchase[] = recentPurchasesData?.data || stockEntries;
    const map = new Map<
      string,
      {
        invoiceNumber: string;
        distributorId?: string;
        distributorName?: string;
        stax?: number;
        createdAt: string;
        count: number;
      }
    >();

    for (const entry of list) {
      const inv = entry.invoice_number?.trim();
      if (!inv) continue;

      if (!map.has(inv)) {
        map.set(inv, {
          invoiceNumber: inv,
          distributorId: entry.distributor_id || undefined,
          distributorName: entry.distributor_name || undefined,
          stax: entry.stax ?? 0,
          createdAt: entry.created_at,
          count: 1,
        });
      } else {
        const item = map.get(inv)!;
        item.count += 1;
        if (!item.distributorId && entry.distributor_id) {
          item.distributorId = entry.distributor_id;
          item.distributorName = entry.distributor_name;
        }
        if (item.stax === undefined && entry.stax !== undefined) {
          item.stax = entry.stax;
        }
      }
    }

    return Array.from(map.values());
  }, [recentPurchasesData?.data, stockEntries]);

  const totalValue = stockEntries.reduce((s: number, i: StockPurchase) => s + i.total_value, 0);

  const createMutation = useMutation({
    mutationFn: () =>
      api.stock.create({
        productId: form.productId,
        distributorId: form.distributorId || undefined,
        invoiceNumber: form.invoiceNumber,
        batchNumber: form.batchNumber || undefined,
        quantity: Number(form.quantity),
        stax: form.stax ? Number(form.stax) : 0,
        expiry: form.expiry || undefined,
        priceTierId: form.priceTierId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-stock-purchases"] });

      const prodName = products.find((p: Product) => p.id === form.productId)?.name || "Product";

      if (isSavingAndNextRef.current) {
        setForm((prev) => ({
          ...prev,
          productId: "",
          batchNumber: "",
          quantity: "",
          expiry: "",
          priceTierId: null,
        }));
        toast.success(`Saved ${prodName}! Ready for next item on Invoice ${form.invoiceNumber || "Consignment"}.`);
        setTimeout(() => {
          scanRef.current?.focus();
        }, 80);
      } else {
        setOpen(false);
        setForm({
          productId: "",
          distributorId: "",
          invoiceNumber: "",
          batchNumber: "",
          quantity: "",
          stax: "",
          expiry: "",
          priceTierId: "",
        });
        toast.success("Stock purchase recorded");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.stock.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-stock-purchases"] });
      toast.success("Stock entry deleted");
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restorePasswordOpen, setRestorePasswordOpen] = useState(false);
  const [hardDeleteTargetId, setHardDeleteTargetId] = useState<string | null>(null);
  const [hardDeletePasswordOpen, setHardDeletePasswordOpen] = useState(false);

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.stock.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-stock-purchases"] });
      toast.success("Stock entry restored");
      setRestoreTargetId(null);
      setRestorePasswordOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to restore stock entry");
      setRestoreTargetId(null);
      setRestorePasswordOpen(false);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => api.stock.hardDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-stock-purchases"] });
      toast.success("Stock entry permanently deleted");
      setHardDeleteTargetId(null);
      setHardDeletePasswordOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to permanently delete stock entry");
      setHardDeleteTargetId(null);
      setHardDeletePasswordOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.stock.update(editingId!, {
        productId: form.productId,
        distributorId: form.distributorId || undefined,
        invoiceNumber: form.invoiceNumber,
        batchNumber: form.batchNumber || undefined,
        quantity: Number(form.quantity),
        stax: form.stax ? Number(form.stax) : 0,
        expiry: form.expiry || undefined,
        priceTierId: form.priceTierId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-stock-purchases"] });
      setOpen(false);
      setEditingId(null);
      setForm({
        productId: "",
        distributorId: "",
        invoiceNumber: "",
        batchNumber: "",
        quantity: "",
        stax: "",
        expiry: "",
        priceTierId: "",
      });
      toast.success("Stock purchase updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (open && scanRef.current) {
      setTimeout(() => scanRef.current?.focus(), 100);
    }
  }, [open]);

  function handleSaveAndAddNext() {
    if (!form.productId || !form.quantity) return;
    isSavingAndNextRef.current = true;
    createMutation.mutate();
  }

  function handleSaveAndClose() {
    if (!form.productId || !form.quantity) return;
    isSavingAndNextRef.current = false;
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  function handleSelectProduct(productId: string) {
    const product = products.find((p: Product) => p.id === productId);
    const purchasesList: StockPurchase[] = recentPurchasesData?.data || stockEntries;
    const lastPurchase = purchasesList.find((s: StockPurchase) => s.product_id === productId);

    // Determine default price tier: prefer last purchase's tier, else first available tier, else null
    let defaultPriceTierId: string | null = null;
    if (lastPurchase?.price_tier_id) {
      defaultPriceTierId = lastPurchase.price_tier_id;
    } else if (product?.prices && product.prices.length > 0) {
      defaultPriceTierId = product.prices[0].id;
    }

    setForm((prev) => {
      const updated = { ...prev, productId, priceTierId: defaultPriceTierId };

      // Pre-fill batch from last purchase if empty
      if (!updated.batchNumber && lastPurchase?.batch_number) {
        updated.batchNumber = lastPurchase.batch_number;
      }

      // Pre-fill expiry if empty
      if (!updated.expiry && (lastPurchase?.expiry || product?.expiry)) {
        updated.expiry = lastPurchase?.expiry || product?.expiry || "";
      }

      // Pre-fill distributor if empty and no invoice selected
      if (!updated.distributorId && lastPurchase?.distributor_id) {
        updated.distributorId = lastPurchase.distributor_id;
      }

      // Pre-fill stax if empty and no invoice selected
      if (updated.stax === "" && lastPurchase?.stax !== undefined && lastPurchase?.stax !== null) {
        updated.stax = String(lastPurchase.stax);
      }

      return updated;
    });

    if (lastPurchase?.batch_number || lastPurchase?.expiry) {
      toast.info(`Pre-filled batch & expiry suggestions from last purchase of ${product?.name || "product"}.`);
    }
  }

  async function handleScan(value: string) {
    const product = await api.products.getByBarcode(value.trim());
    if (product) {
      handleSelectProduct(product.id);
      toast.success(`Found: ${product.name}`);
    } else {
      toast.error("No product found with this barcode");
    }
    setScanValue("");
    scanRef.current?.focus();
  }

  async function handleToolbarScan(barcode: string) {
    const product = await api.products.getByBarcode(barcode.trim());
    if (product) {
      openAdd();
      handleSelectProduct(product.id);
      toast.success(`Received scan for: ${product.name}`);
    } else {
      toast.error("No product found with this barcode");
    }
    setToolbarScan("");
  }

  function openAdd(prefillInvoiceNumber?: unknown) {
    setEditingId(null);
    setScanValue("");

    const invStr = typeof prefillInvoiceNumber === "string" ? prefillInvoiceNumber.trim() : "";
    const targetInv = invStr
      ? recentInvoices.find((i) => i.invoiceNumber.toLowerCase() === invStr.toLowerCase())
      : recentInvoices.length > 0
      ? recentInvoices[0]
      : null;

    if (targetInv) {
      setForm({
        productId: "",
        distributorId: targetInv.distributorId || "",
        invoiceNumber: targetInv.invoiceNumber,
        batchNumber: "",
        quantity: "",
        stax: targetInv.stax !== undefined && targetInv.stax !== null ? String(targetInv.stax) : "",
        expiry: "",
        priceTierId: "",
      });
      setInvoiceMode("recent");
    } else {
      setForm({
        productId: "",
        distributorId: "",
        invoiceNumber: invStr,
        batchNumber: "",
        quantity: "",
        stax: "",
        expiry: "",
        priceTierId: "",
      });
      setInvoiceMode("new");
    }
    setOpen(true);
  }

  function openEdit(entry: StockPurchase) {
    setEditingId(entry.id);
    setForm({
      productId: entry.product_id,
      distributorId: entry.distributor_id || "",
      invoiceNumber: entry.invoice_number || "",
      batchNumber: entry.batch_number || "",
      quantity: String(entry.quantity),
      stax: entry.stax !== undefined && entry.stax !== null ? String(entry.stax) : "",
      expiry: entry.expiry || "",
      priceTierId: entry.price_tier_id ?? null,
    });
    setInvoiceMode(
      recentInvoices.some((i) => i.invoiceNumber.toLowerCase() === (entry.invoice_number || "").toLowerCase().trim())
        ? "recent"
        : "new"
    );
    setOpen(true);
  }

  const columns = [
    {
      key: "created_at",
      header: "Date",
      sortable: true,
      sortKey: "createdAt",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-[11px] text-text-secondary">
          {formatDate(s.created_at)}
        </span>
      ),
    },
    {
      key: "product_name",
      header: "Product",
      sortable: true,
      sortKey: "productName",
      cell: (s: StockPurchase) => (
        <span className="text-xs font-medium text-text-primary">{s.product_name}</span>
      ),
    },
    {
      key: "distributor_name",
      header: "Distributor",
      cell: (s: StockPurchase) => (
        <span className="text-[11px] text-text-secondary">{s.distributor_name || "\u2014"}</span>
      ),
    },
    {
      key: "invoice_number",
      header: "Invoice",
      sortable: true,
      sortKey: "invoiceNumber",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-[11px] text-text-secondary">
          {s.invoice_number || "\u2014"}
        </span>
      ),
    },
    {
      key: "batch_number",
      header: "Batch #",
      sortable: true,
      sortKey: "batchNumber",
      cell: (s: StockPurchase) => (
        <button
          onClick={() => {
            if (s.batch_number) {
              setTraceBatchNumber(s.batch_number);
              setTraceBatchOpen(true);
            }
          }}
          disabled={!s.batch_number}
          className={cn(
            "font-mono text-[11px] font-semibold text-left transition-colors",
            s.batch_number
              ? "text-brand hover:underline cursor-pointer"
              : "text-text-secondary cursor-default"
          )}
          title={s.batch_number ? "Click to trace batch & recall audit" : ""}
        >
          {s.batch_number || "\u2014"}
        </button>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      sortable: true,
      sortKey: "quantity",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-xs font-semibold">{s.quantity}</span>
      ),
    },
    {
      key: "purchase_price",
      header: "Cost",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-xs">{formatCurrency(s.purchase_price)}</span>
      ),
    },
    {
      key: "stax",
      header: "STAX (PKR)",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-xs text-text-secondary">
          {s.stax ? formatCurrency(s.stax) : "—"}
        </span>
      ),
    },
    {
      key: "sale_price",
      header: "Sale Price",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-xs text-accent font-semibold">
          {formatCurrency(s.sale_price)}
        </span>
      ),
    },
    {
      key: "total_value",
      header: "Total",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-xs font-bold text-text-primary">
          {formatCurrency(s.total_value)}
        </span>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      cell: (s: StockPurchase) => (
        <span className="font-mono text-[11px] text-text-secondary">
          {s.expiry ? formatDate(s.expiry) : "\u2014"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (s: StockPurchase) => (
        <div className="flex items-center gap-0.5 justify-end">
          {s.active !== 0 ? (
            <>
              <button
                onClick={() => openEdit(s)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-brand hover:bg-brand/10 transition-colors"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteId(s.id)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors"
                title="Archive"
              >
                <Archive className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setRestoreTargetId(s.id);
                  setRestorePasswordOpen(true);
                }}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                title="Restore"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setHardDeleteTargetId(s.id);
                  setHardDeletePasswordOpen(true);
                }}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                title="Delete Permanently"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Stock Purchases & Inward"
        description="Receive stock consignments, distributor delivery invoices, and batch lots"
        action={{
          label: (
            <>
              <span>New Purchase</span>
              <ShortcutHint shortcut="Mod+N" />
            </>
          ),
          onClick: () => openAdd(),
        }}
      />

      {/* Stock Overview Banner */}
      <div className="rounded-3xl border border-border/80 bg-surface p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            Total Inward Stock Valuation
          </p>
          <div className="flex items-center gap-3">
            <p className="text-2xl sm:text-3xl font-display font-bold text-text-primary tabular-nums tracking-tight">
              {showValue ? formatCurrency(totalValue) : "••••••••"}
            </p>
            <button
              onClick={() => setShowValue(!showValue)}
              className="h-8 w-8 rounded-xl bg-[#4A25E1]/10 dark:bg-white/10 flex items-center justify-center text-[#4A25E1] dark:text-[#754BFB] hover:scale-105 transition-all cursor-pointer"
              title={showValue ? "Hide value" : "Show value"}
            >
              {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            Cumulative value of active received shipments
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              ref={searchRef}
              autoFocus
              placeholder="Search by product, company, distributor, invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-[#4A25E1]/25"
            />
          </div>
          <div className="relative min-w-[210px]">
            <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              placeholder="Scan barcode to receive stock..."
              value={toolbarScan}
              onChange={(e) => setToolbarScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && toolbarScan.trim()) {
                  handleToolbarScan(toolbarScan.trim());
                }
              }}
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-[#4A25E1]/25"
            />
          </div>
          <Select
            value={sortBy === "createdAt" ? (sortOrder === "desc" ? "recent" : "oldest") : (sortBy === "productName" ? (sortOrder === "asc" ? "name_asc" : "name_desc") : "custom")}
            onValueChange={(val) => {
              if (val === "recent") { setSortBy("createdAt"); setSortOrder("desc"); }
              else if (val === "oldest") { setSortBy("createdAt"); setSortOrder("asc"); }
              else if (val === "name_asc") { setSortBy("productName"); setSortOrder("asc"); }
              else if (val === "name_desc") { setSortBy("productName"); setSortOrder("desc"); }
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-[140px] rounded-full border border-border/80 bg-surface shadow-xs text-xs shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-text-secondary shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name_asc">Product (A-Z)</SelectItem>
              <SelectItem value="name_desc">Product (Z-A)</SelectItem>
              {sortBy !== "createdAt" && sortBy !== "productName" && (
                <SelectItem value="custom">Sort: {sortBy} ({sortOrder})</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl shadow-xs border-brand/30 text-brand hover:bg-brand/10 gap-1.5"
            onClick={() => {
              setTraceBatchNumber("");
              setTraceBatchOpen(true);
            }}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Batch Audit
          </Button>
          <ExportButton type="pdf" onClick={handleExportPDF} />
          <ExportButton type="csv" onClick={handleExportCSV} />
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "rounded-xl shadow-xs",
              showArchived
                ? "border-[#4A25E1] text-[#4A25E1] dark:border-[#754BFB] dark:text-[#754BFB] bg-[#4A25E1]/10"
                : ""
            )}
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            {showArchived ? "Archived Stock" : "Archived"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={stockEntries}
          loading={isLoading}
          keyExtractor={(s: StockPurchase) => s.id}
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setEditingId(null);
          }
          setOpen(v);
        }}
      >
        <DialogContent
          className="max-w-lg"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (editingId) {
                handleSaveAndClose();
              } else {
                handleSaveAndAddNext();
              }
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Stock Purchase" : "Record Stock Purchase"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3.5">
            {/* INVOICE & DISTRIBUTOR CARD */}
            <div className="rounded-2xl border border-border/70 bg-surface-hover/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span>Invoice & Consignment</span>
                </div>
                {recentInvoices.length > 0 && !editingId && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setInvoiceMode("recent")}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer",
                        invoiceMode === "recent"
                          ? "bg-brand text-white font-medium shadow-xs"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface"
                      )}
                    >
                      Recent Invoices
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceMode("new");
                        setForm((prev) => ({ ...prev, invoiceNumber: "" }));
                      }}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer",
                        invoiceMode === "new"
                          ? "bg-brand text-white font-medium shadow-xs"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface"
                      )}
                    >
                      + New Invoice
                    </button>
                  </div>
                )}
              </div>

              {/* Quick 1-click Latest Invoice Pill */}
              {recentInvoices.length > 0 && !editingId && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-text-secondary">Quick pick:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const latest = recentInvoices[0];
                      setForm((prev) => ({
                        ...prev,
                        invoiceNumber: latest.invoiceNumber,
                        distributorId: latest.distributorId || prev.distributorId,
                        stax: latest.stax !== undefined && latest.stax !== null ? String(latest.stax) : prev.stax,
                      }));
                      setInvoiceMode("recent");
                      toast.info(`Loaded Latest Invoice: ${latest.invoiceNumber} (${latest.distributorName || "Supplier"})`);
                    }}
                    className={cn(
                      "text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer",
                      form.invoiceNumber === recentInvoices[0].invoiceNumber
                        ? "border-brand bg-brand/10 text-brand font-medium ring-1 ring-brand/30"
                        : "border-border/80 bg-surface text-text-secondary hover:border-brand/50 hover:text-text-primary"
                    )}
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Latest: <strong>{recentInvoices[0].invoiceNumber}</strong></span>
                    <span className="text-[10px] opacity-75">
                      ({recentInvoices[0].distributorName || "Supplier"}{recentInvoices[0].stax ? ` • ${formatCurrency(recentInvoices[0].stax)} STAX` : ""})
                    </span>
                  </button>
                </div>
              )}

              {/* Invoice Number Input/Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Invoice Number</Label>
                  {invoiceMode === "recent" && recentInvoices.length > 0 && !editingId ? (
                    <SearchableSelect
                      options={recentInvoices.map((inv) => ({
                        value: inv.invoiceNumber,
                        label: `${inv.invoiceNumber} — ${inv.distributorName || "Supplier"} (${formatCurrency(inv.stax ?? 0)} STAX)`,
                      }))}
                      value={form.invoiceNumber}
                      onChange={(invNum) => {
                        const matched = recentInvoices.find((i) => i.invoiceNumber === invNum);
                        if (matched) {
                          setForm((prev) => ({
                            ...prev,
                            invoiceNumber: matched.invoiceNumber,
                            distributorId: matched.distributorId || prev.distributorId,
                            stax: matched.stax !== undefined && matched.stax !== null ? String(matched.stax) : prev.stax,
                          }));
                          toast.info(`Invoice ${matched.invoiceNumber} loaded with distributor & STAX.`);
                        } else {
                          setForm((prev) => ({ ...prev, invoiceNumber: invNum }));
                        }
                      }}
                      placeholder="Select recent invoice..."
                    />
                  ) : (
                    <Input
                      value={form.invoiceNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = recentInvoices.find(
                          (i) => i.invoiceNumber.toLowerCase() === val.toLowerCase().trim()
                        );
                        if (matched) {
                          setForm((prev) => ({
                            ...prev,
                            invoiceNumber: val,
                            distributorId: matched.distributorId || prev.distributorId,
                            stax: matched.stax !== undefined && matched.stax !== null ? String(matched.stax) : prev.stax,
                          }));
                        } else {
                          setForm((prev) => ({ ...prev, invoiceNumber: val }));
                        }
                      }}
                      placeholder="e.g. INV-90412"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Distributor / Supplier</Label>
                  <SearchableSelect
                    options={distributors.map((d: Distributor) => ({
                      value: d.id,
                      label: d.name || "Unnamed",
                    }))}
                    value={form.distributorId}
                    onChange={(v) => setForm({ ...form, distributorId: v })}
                    placeholder="Select distributor"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">STAX (PKR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 150 (sales tax in PKR for this invoice)"
                  value={form.stax}
                  onChange={(e) => setForm({ ...form, stax: e.target.value })}
                />
              </div>
            </div>

            {/* PRODUCT & ITEM SECTION */}
            <div className="space-y-3 pt-1">
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                <Input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && scanValue.trim()) {
                      e.preventDefault();
                      handleScan(scanValue.trim());
                    }
                  }}
                  placeholder="Scan product barcode / QR code to auto-select..."
                  className="pl-9 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Product</Label>
                <SearchableSelect
                  options={products.map((p: Product) => ({
                    value: p.id,
                    label: `${p.name} — ${p.category || "No Category"}`,
                  }))}
                  value={form.productId}
                  onChange={(v) => handleSelectProduct(v)}
                  placeholder="Select product"
                />
              </div>

              {/* Price Tier Selection */}
              {form.productId && (
                <div className="space-y-1">
                  <Label className="text-xs">Price Tier</Label>
                  <Select
                    value={form.priceTierId || ""}
                    onValueChange={(v) => setForm({ ...form, priceTierId: v || null })}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-xl">
                      <SelectValue placeholder="Use default price" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const product = products.find((p: Product) => p.id === form.productId);
                        const tiers = product?.prices ?? [];
                        if (tiers.length === 0) {
                          return (
                            <SelectItem disabled value="">
                              No price tiers configured for this product
                            </SelectItem>
                          );
                        }
                        return tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            <div className="flex justify-between w-full text-xs">
                              <span className="font-medium">{tier.label}</span>
                              <span className="font-mono text-text-secondary">
                                {formatCurrency(tier.purchasePrice)} / {formatCurrency(tier.salePrice)}
                              </span>
                            </div>
                            <div className="text-[10px] text-text-secondary">
                              Purchase: {formatCurrency(tier.purchasePrice)} &nbsp;•&nbsp; Sale: {formatCurrency(tier.salePrice)}
                            </div>
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  {form.priceTierId && (
                    <p className="text-[10px] text-text-secondary">
                      Selected tier will be used for purchase &amp; sale prices on this stock entry.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder="e.g. 50"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Batch Number</Label>
                  <Input
                    value={form.batchNumber}
                    onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                    placeholder="e.g. B-2048 / LOT-99"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Expiry Date (optional)</Label>
                <Input
                  type="date"
                  value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="pt-2">
              {editingId ? (
                <Button
                  className="w-full"
                  disabled={!form.productId || !form.quantity || updateMutation.isPending}
                  onClick={handleSaveAndClose}
                >
                  {updateMutation.isPending ? "Updating..." : "Update Purchase"}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="flex-1 gap-1.5 font-medium shadow-sm"
                    disabled={!form.productId || !form.quantity || createMutation.isPending}
                    onClick={handleSaveAndAddNext}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Save & Add Next</span>
                    <span className="hidden sm:inline-block text-[10px] bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono ml-1">
                      Ctrl+Enter
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!form.productId || !form.quantity || createMutation.isPending}
                    onClick={handleSaveAndClose}
                  >
                    <span>Save & Close</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
        title="Archive Stock Entry"
        description="This will remove the stock quantity from the product. The entry will be archived and can be restored later."
        confirmLabel="Archive"
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
        loading={deleteMutation.isPending}
      />

      <PasswordConfirmDialog
        open={restorePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setRestorePasswordOpen(false);
            setRestoreTargetId(null);
          }
        }}
        title="Restore Stock Entry"
        description="Enter admin password to restore this archived stock entry and restore its quantity to inventory."
        confirmLabel="Restore"
        onConfirm={() => {
          if (restoreTargetId) restoreMutation.mutate(restoreTargetId);
        }}
        loading={restoreMutation.isPending}
      />

      <PasswordConfirmDialog
        open={hardDeletePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setHardDeletePasswordOpen(false);
            setHardDeleteTargetId(null);
          }
        }}
        title="Delete Stock Entry Permanently"
        description="This action cannot be undone. Enter admin password to permanently delete this stock entry record."
        confirmLabel="Delete Permanently"
        onConfirm={() => {
          if (hardDeleteTargetId) hardDeleteMutation.mutate(hardDeleteTargetId);
        }}
        loading={hardDeleteMutation.isPending}
      />

      <BatchTraceDialog
        open={traceBatchOpen}
        onOpenChange={setTraceBatchOpen}
        initialBatchNumber={traceBatchNumber}
      />
    </div>
  );
}
