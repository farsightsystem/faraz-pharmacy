import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tags, Search, Plus, Pencil, Trash2, Download, ChevronLeft, ChevronRight, Archive, RotateCcw, ArrowUpDown } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { formatDate, cn } from "@/lib/utils";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import ExportButton from "@/components/shared/ExportButton";
import type { Category } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";

export default function Categories() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archivePasswordOpen, setArchivePasswordOpen] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restorePasswordOpen, setRestorePasswordOpen] = useState(false);
  const [hardDeleteTargetId, setHardDeleteTargetId] = useState<string | null>(null);
  const [hardDeletePasswordOpen, setHardDeletePasswordOpen] = useState(false);
  const [name, setName] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit, showArchived, sortBy, sortOrder]);

  const { data, isLoading } = useQuery({
    queryKey: ["categories", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.categories.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        archived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const categories = data?.data ?? [];
  const meta = data?.meta;

  const createMutation = useMutation({
    mutationFn: () => api.categories.create({ name }),
    onSuccess: () => {
      toast.success("Category created");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false);
      setName("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.categories.update(editingId!, { name }),
    onSuccess: () => {
      toast.success("Category updated");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false);
      setEditingId(null);
      setName("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.categories.archive(id),
    onSuccess: () => {
      toast.success("Category archived");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setArchivePasswordOpen(false);
      setArchiveTargetId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setArchivePasswordOpen(false);
      setArchiveTargetId(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.categories.restore(id),
    onSuccess: () => {
      toast.success("Category restored");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setRestorePasswordOpen(false);
      setRestoreTargetId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setRestorePasswordOpen(false);
      setRestoreTargetId(null);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => api.categories.hardDelete(id),
    onSuccess: () => {
      toast.success("Category permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
  });

  function openAdd() {
    setEditingId(null);
    setName("");
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditingId(c.id);
    setName(c.name);
    setOpen(true);
  }

  function handleExportCSV() {
    downloadCSV(
      `categories_${new Date().toISOString().split("T")[0]}.csv`,
      ["Name"],
      categories.map((c: Category) => [c.name])
    );
  }

  function handleExportPDF() {
    downloadPDF(
      `categories_${new Date().toISOString().split("T")[0]}.pdf`,
      "Categories List",
      ["Name"],
      categories.map((c: Category) => [c.name])
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Organize and structure pharmaceutical product categories"
        action={{
          label: (
            <span className="flex items-center gap-1.5">
              Add Category
            </span>
          ),
          onClick: openAdd,
        }}
      />

      {/* Modern Search & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px] max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
            <Input
              autoFocus
              placeholder="Search categories..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-10 rounded-full bg-surface border-border/80 shadow-xs focus:ring-2 focus:ring-brand/20 transition-all text-xs"
            />
          </div>
          <Select
            value={sortBy === "createdAt" ? (sortOrder === "desc" ? "recent" : "oldest") : (sortOrder === "asc" ? "name_asc" : "name_desc")}
            onValueChange={(val) => {
              if (val === "recent") { setSortBy("createdAt"); setSortOrder("desc"); }
              else if (val === "oldest") { setSortBy("createdAt"); setSortOrder("asc"); }
              else if (val === "name_asc") { setSortBy("name"); setSortOrder("asc"); }
              else if (val === "name_desc") { setSortBy("name"); setSortOrder("desc"); }
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-[145px] rounded-full border border-border/80 bg-surface shadow-xs text-xs shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-text-secondary shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "rounded-xl shadow-xs",
              showArchived
                ? "border-[#4A25E1] text-[#4A25E1] dark:border-[#754BFB] dark:text-[#754BFB]"
                : ""
            )}
            onClick={() => {
              setShowArchived(!showArchived);
              setPage(1);
            }}
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            Archived
          </Button>
          <ExportButton type="csv" onClick={handleExportCSV} />
          <ExportButton type="pdf" onClick={handleExportPDF} />
        </div>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-surface-2/60" />
          ))
        ) : categories.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-border bg-surface/50 text-center py-16 text-sm text-text-secondary">
            {debouncedSearch
              ? "No categories match your search query."
              : showArchived
                ? "No archived categories found."
                : "No categories added yet. Click 'Add Category' to get started."}
          </div>
        ) : (
          categories.map((cat: Category) => (
            <div
              key={cat.id}
              className="group rounded-2xl border border-border/80 bg-surface p-4.5 shadow-xs hover:shadow-md hover:border-brand/40 transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="h-11 w-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Tags className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-text-primary truncate tracking-tight">
                      {cat.name}
                    </h3>
                    <p className="text-[11px] text-text-secondary mt-0.5 font-mono">
                      Added: {formatDate(cat.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!showArchived ? (
                    <>
                      <button
                        onClick={() => openEdit(cat)}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-brand hover:bg-brand/10 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setArchiveTargetId(cat.id);
                          setArchivePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRestoreTargetId(cat.id);
                          setRestorePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setHardDeleteTargetId(cat.id);
                          setHardDeletePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete Permanently"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Unified Pagination Bar */}
      {meta && (
        <div className="rounded-2xl border border-border/80 bg-surface p-3 px-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-text-secondary font-medium">
            Showing <span className="font-semibold text-text-primary">{(page - 1) * limit + 1}</span> to{" "}
            <span className="font-semibold text-text-primary">{Math.min(page * limit, meta.total)}</span> of{" "}
            <span className="font-semibold text-text-primary">{meta.total}</span> categories
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-xl h-8 px-3 text-xs shadow-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
            </Button>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-2 text-text-primary">
              Page {page} of {meta.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-xl h-8 px-3 text-xs shadow-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Category Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setEditingId(null);
          setOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display">
              {editingId ? "Edit Category" : "Add Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-text-primary">Category Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Antibiotics, Pain Relief, Syrups"
                className="h-10 rounded-xl"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl bg-gradient-to-r from-[#4A25E1] to-[#3612B8] text-white hover:from-[#3e1ed1] hover:to-[#2e0ea3] shadow-md shadow-brand/20"
                disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingId
                  ? "Save Changes"
                  : "Create Category"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordConfirmDialog
        open={archivePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setArchivePasswordOpen(false);
            setArchiveTargetId(null);
          }
        }}
        title="Archive Category"
        description="Enter admin password to archive this category."
        confirmLabel="Archive"
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTargetId) archiveMutation.mutate(archiveTargetId);
        }}
      />

      <PasswordConfirmDialog
        open={restorePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setRestorePasswordOpen(false);
            setRestoreTargetId(null);
          }
        }}
        title="Restore Category"
        description="Enter admin password to restore this archived category."
        confirmLabel="Restore"
        loading={restoreMutation.isPending}
        onConfirm={() => {
          if (restoreTargetId) restoreMutation.mutate(restoreTargetId);
        }}
      />

      <PasswordConfirmDialog
        open={hardDeletePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setHardDeletePasswordOpen(false);
            setHardDeleteTargetId(null);
          }
        }}
        title="Delete Category Permanently"
        description="This action cannot be undone. Enter admin password to permanently delete this category."
        confirmLabel="Delete Permanently"
        loading={hardDeleteMutation.isPending}
        onConfirm={() => {
          if (hardDeleteTargetId) hardDeleteMutation.mutate(hardDeleteTargetId);
        }}
      />
    </div>
  );
}