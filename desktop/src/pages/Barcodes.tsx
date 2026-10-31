import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Barcode,
  Printer,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  Archive,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import { api } from "@/lib/api";
import { cn, renderBarcode } from "@/lib/utils";
import { downloadPDF, downloadCSV } from "@/lib/export";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import { useDebounce } from "@/hooks/useDebounce";
import { ShortcutHint } from "@/components/shared/Kbd";
import ExportButton from "@/components/shared/ExportButton";
import PrintBarcodeDialog from "@/components/shared/PrintBarcodeDialog";
import type { BarcodeEntry } from "@/types";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
};

const cardAnim: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
};

export default function Barcodes() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [printTarget, setPrintTarget] = useState<
    { barcode: string; productName?: string } | undefined
  >(undefined);
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BarcodeEntry | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BarcodeEntry | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BarcodeEntry | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<BarcodeEntry | null>(null);
  const queryClient = useQueryClient();
  const { searchRef } = useModuleShortcuts({
    onAdd: openGenerate,
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "name" || key === "code" ? "asc" : "desc");
    }
    setPage(1);
  };

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, showArchived, limit, sortBy, sortOrder]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["barcodes", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.barcodes.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        includeArchived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const barcodes = paginatedData?.data ?? [];
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.barcodes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barcodes"] });
      toast.success("Barcode deleted");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.barcodes.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barcodes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product archived");
      setArchiveTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.barcodes.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barcodes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product restored");
      setRestoreTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const exportRows = useMemo(() => {
    if (!barcodes) return [];
    return barcodes.map((b) => [
      b.code,
      b.product?.name || "Unassigned",
      b.product?.active != null && b.product.active > 0 ? "Active" : "Inactive",
    ]);
  }, [barcodes]);

  const exportHeaders = ["Code", "Product", "Status"];

  function handleExportPDF() {
    downloadPDF("barcodes.pdf", "Barcodes", exportHeaders, exportRows);
  }

  function handleExportCSV() {
    downloadCSV("barcodes.csv", exportHeaders, exportRows);
  }

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const getBarcodeId = useCallback(() => {
    return `bc-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  useEffect(() => {
    if (view !== "grid" || !barcodes.length) return;
    const timer = requestAnimationFrame(() => {
      barcodes.forEach((b) => {
        const el = document.getElementById(`bc-${b.id}`) as unknown as SVGElement | null;
        if (!el) return;
        renderBarcode(el, b.code, {
          width: 1.5,
          height: 32,
          displayValue: false,
          margin: 0,
          fontSize: 10,
        });
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [barcodes, view]);

  function openPrint(barcode: string, productName?: string) {
    setPrintTarget({ barcode, productName });
    setPrintOpen(true);
  }

  function openGenerate() {
    setPrintTarget(undefined);
    setPrintOpen(true);
  }

  function handleDelete(b: BarcodeEntry) {
    // Can delete if: no product linked, OR product is archived
    if (b.productId && b.product && b.product.active === 1) return;
    setDeleteTarget(b);
  }

  function handleArchive(b: BarcodeEntry) {
    if (!b.productId || !b.product || b.product.active !== 1) return;
    setArchiveTarget(b);
  }

  function handleRestore(b: BarcodeEntry) {
    if (!b.productId || !b.product || b.product.active !== 0) return;
    setRestoreTarget(b);
  }

  function handleHardDelete(b: BarcodeEntry) {
    if (!b.productId || !b.product || b.product.active !== 0) return;
    setHardDeleteTarget(b);
  }

  function confirmHardDelete() {
    if (!hardDeleteTarget) return;
    // Hard delete the product which will also delete the barcode
    api.products
      .hardDelete(hardDeleteTarget.productId!)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["barcodes"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        toast.success("Product and barcode permanently deleted");
        setHardDeleteTarget(null);
      })
      .catch((err) => {
        toast.error(err.message);
      });
  }

  const canDelete = (b: BarcodeEntry) => !b.productId || (b.product && b.product.active === 0);
  const canArchive = (b: BarcodeEntry) => b.productId && b.product && b.product.active === 1;
  const canRestore = (b: BarcodeEntry) => b.productId && b.product && b.product.active === 0;

  return (
    <div className="flex flex-col h-full space-y-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
            <Input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by barcode or medicine name..."
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-[#4A25E1]/25"
            />
          </div>
          <Select
            value={
              sortBy === "createdAt" && sortOrder === "desc"
                ? "recent"
                : sortBy === "createdAt" && sortOrder === "asc"
                ? "oldest"
                : sortBy === "name" && sortOrder === "asc"
                ? "name_asc"
                : sortBy === "name" && sortOrder === "desc"
                ? "name_desc"
                : sortBy === "code" && sortOrder === "asc"
                ? "code_asc"
                : sortBy === "code" && sortOrder === "desc"
                ? "code_desc"
                : "recent"
            }
            onValueChange={(val) => {
              if (val === "recent") {
                setSortBy("createdAt");
                setSortOrder("desc");
              } else if (val === "oldest") {
                setSortBy("createdAt");
                setSortOrder("asc");
              } else if (val === "name_asc") {
                setSortBy("name");
                setSortOrder("asc");
              } else if (val === "name_desc") {
                setSortBy("name");
                setSortOrder("desc");
              } else if (val === "code_asc") {
                setSortBy("code");
                setSortOrder("asc");
              } else if (val === "code_desc") {
                setSortBy("code");
                setSortOrder("desc");
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
              <SelectItem value="name_asc">Product (A-Z)</SelectItem>
              <SelectItem value="name_desc">Product (Z-A)</SelectItem>
              <SelectItem value="code_asc">Barcode (Asc)</SelectItem>
              <SelectItem value="code_desc">Barcode (Desc)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-border/80 rounded-xl overflow-hidden bg-surface shadow-xs p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                view === "grid"
                  ? "bg-[#4A25E1] text-white shadow-xs"
                  : "text-text-secondary hover:bg-surface-2"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                view === "list"
                  ? "bg-[#4A25E1] text-white shadow-xs"
                  : "text-text-secondary hover:bg-surface-2"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn("rounded-xl shadow-xs", showArchived ? "border-[#4A25E1] text-[#4A25E1]" : "")}
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            Archived
          </Button>
          <ExportButton type="pdf" onClick={handleExportPDF} />
          <ExportButton type="csv" onClick={handleExportCSV} />
          <Button size="sm" variant="brand" onClick={openGenerate} className="gap-1.5 rounded-xl shadow-xs">
            <Plus className="h-4 w-4" />
            Generate Barcode <ShortcutHint shortcut="Mod+N" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-xs text-text-secondary">
          Loading...
        </div>
      ) : barcodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-text-secondary py-16">
          <Barcode className="h-10 w-10 opacity-30 text-[#4A25E1]" />
          <p className="text-sm font-medium">{debouncedSearch ? "No barcodes match your search" : "No barcodes generated yet"}</p>
          {!debouncedSearch && (
            <Button variant="brand" size="sm" onClick={openGenerate} className="gap-1.5 rounded-xl mt-2">
              <Plus className="h-3.5 w-3.5" />
              Generate your first barcode
            </Button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="flex-1 overflow-y-auto">
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5"
          >
            {barcodes.map((b) => (
              <motion.div
                key={b.id}
                variants={cardAnim}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border/80 bg-surface shadow-xs hover:border-[#4A25E1]/40 hover:shadow-md transition-all duration-200 group relative"
              >
                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canArchive(b) && (
                    <button
                      onClick={() => handleArchive(b)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                      title="Archive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canRestore(b) && (
                    <button
                      onClick={() => handleRestore(b)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                      title="Restore"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete(b) && (
                    <button
                      onClick={() => handleDelete(b)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-center w-full min-h-[46px] p-2 rounded-xl bg-white">
                  <svg id={`bc-${b.id}`} className="max-w-full h-[36px]" />
                </div>
                <span className="text-[10px] text-text-secondary font-mono tracking-wider text-center leading-tight break-all font-semibold">
                  {b.code}
                </span>
                <span className="text-xs font-semibold text-text-primary text-center leading-tight line-clamp-1 min-h-[1.2em]">
                  {b.product ? (
                    b.product.name
                  ) : (
                    <span className="text-text-secondary italic text-[11px]">Unassigned Product</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openPrint(b.code, b.product?.name)}
                  className="w-full h-8 text-xs gap-1.5 mt-2 rounded-xl border-border/80 shadow-xs group-hover:border-[#4A25E1]/40"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Label</span>
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-[10px] font-medium text-text-secondary text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleSort("code")}
                      className="group inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-text-primary transition-colors cursor-pointer select-none"
                    >
                      Barcode
                      {sortBy === "code" ? (
                        sortOrder === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-brand" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-brand" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 text-text-secondary transition-opacity" />
                      )}
                    </button>
                  </th>
                  <th className="text-[10px] font-medium text-text-secondary text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="group inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-text-primary transition-colors cursor-pointer select-none"
                    >
                      Product
                      {sortBy === "name" ? (
                        sortOrder === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-brand" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-brand" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 text-text-secondary transition-opacity" />
                      )}
                    </button>
                  </th>
                  <th className="text-[10px] font-medium text-text-secondary text-right px-3 py-2 w-36">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {barcodes.map((b, idx) => (
                  <tr
                    key={b.id}
                    className={`border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors ${idx % 2 === 0 ? "bg-surface" : "bg-surface-2/50"}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-text-primary tracking-wider">
                        {b.code}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {b.product ? (
                        <span className="text-xs text-text-primary">{b.product.name}</span>
                      ) : (
                        <span className="text-xs text-text-secondary italic">No product</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPrint(b.code, b.product?.name)}
                          className="h-7 text-[10px] gap-1.5"
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </Button>
                        {canArchive(b) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleArchive(b)}
                            className="h-7 w-7 p-0 text-text-secondary/40 hover:text-warning hover:border-warning/30"
                            title="Archive"
                          >
                            <Archive className="h-3 w-3" />
                          </Button>
                        )}
                        {canRestore(b) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(b)}
                            className="h-7 w-7 p-0 text-text-secondary/40 hover:text-success hover:border-success/30"
                            title="Restore"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {canDelete(b) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(b)}
                            className="h-7 w-7 p-0 text-text-secondary/40 hover:text-danger hover:border-danger/30"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              id="barcode-limit-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-surface-2 text-text-primary border border-border rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
            >
              {[12, 24, 48, 60, 100].map((val) => (
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
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
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
            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      <PrintBarcodeDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        barcode={printTarget?.barcode}
        productName={printTarget?.productName}
      />

      <PasswordConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title="Delete Barcode"
        description={
          <>
            Delete barcode <span className="font-mono font-medium">{deleteTarget?.code}</span>? This
            action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        loading={deleteMutation.isPending}
      />

      <PasswordConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(v) => {
          if (!v) setArchiveTarget(null);
        }}
        title="Archive Product"
        description={
          <>
            Archive product <span className="font-medium">{archiveTarget?.product?.name}</span>?
            This will also archive the barcode.
          </>
        }
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget.id);
        }}
        loading={archiveMutation.isPending}
      />

      <PasswordConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(v) => {
          if (!v) setRestoreTarget(null);
        }}
        title="Restore Product"
        description={
          <>
            Restore product <span className="font-medium">{restoreTarget?.product?.name}</span>?
            This will also restore the barcode.
          </>
        }
        confirmLabel="Restore"
        onConfirm={() => {
          if (restoreTarget) restoreMutation.mutate(restoreTarget.id);
        }}
        loading={restoreMutation.isPending}
      />

      <PasswordConfirmDialog
        open={!!hardDeleteTarget}
        onOpenChange={(v) => {
          if (!v) setHardDeleteTarget(null);
        }}
        title="Delete Product Permanently"
        description={
          <>
            Permanently delete product{" "}
            <span className="font-medium">{hardDeleteTarget?.product?.name}</span> and its barcode?
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete Permanently"
        onConfirm={confirmHardDelete}
        loading={false}
      />
    </div>
  );
}
