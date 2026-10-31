import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Building2, Search, Plus, Pencil, Trash2, Download, ChevronLeft, ChevronRight, Calendar, Archive, RotateCcw, ArrowUpDown } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
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
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { formatDate, cn } from "@/lib/utils";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import type { Company } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";

export default function Companies() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(48);
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
    queryKey: ["companies", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.companies.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        archived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const companies = data?.data ?? [];
  const meta = data?.meta;

  const createMutation = useMutation({
    mutationFn: () => api.companies.create({ name }),
    onSuccess: () => {
      toast.success("Company created successfully");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setOpen(false);
      setName("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.companies.update(editingId!, { name }),
    onSuccess: () => {
      toast.success("Company updated successfully");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setOpen(false);
      setEditingId(null);
      setName("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.companies.archive(id),
    onSuccess: () => {
      toast.success("Company archived successfully");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
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
    mutationFn: (id: string) => api.companies.restore(id),
    onSuccess: () => {
      toast.success("Company restored successfully");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
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
    mutationFn: (id: string) => api.companies.hardDelete(id),
    onSuccess: () => {
      toast.success("Company permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
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

  function openEdit(c: Company) {
    setEditingId(c.id);
    setName(c.name);
    setOpen(true);
  }

  function handleExportCSV() {
    downloadCSV(
      `companies_${new Date().toISOString().split("T")[0]}.csv`,
      ["Name"],
      companies.map((c: Company) => [c.name])
    );
  }

  function handleExportPDF() {
    downloadPDF(
      `companies_${new Date().toISOString().split("T")[0]}.pdf`,
      "Companies List",
      ["Name"],
      companies.map((c: Company) => [c.name])
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Pharmaceutical Companies"
        description="Brand manufacturers, medicine suppliers and catalog lines"
        action={{
          label: "Add Company",
          onClick: openAdd,
        }}
      />

      {/* Filter & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              autoFocus
              placeholder="Search companies by name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-[#4A25E1]/25"
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="rounded-xl shadow-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-text-secondary" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="rounded-xl shadow-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-text-secondary" /> PDF
          </Button>
        </div>
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))
        ) : companies.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-sm text-text-secondary">
            {debouncedSearch
              ? "No pharmaceutical companies match your search"
              : showArchived
                ? "No archived companies found."
                : "No companies found. Click 'Add Company' to create your first manufacturer."}
          </div>
        ) : (
          companies.map((company: Company) => (
            <div
              key={company.id}
              className="group rounded-2xl border border-border/80 bg-surface p-5 shadow-xs hover:shadow-md hover:border-[#4A25E1]/40 transition-all duration-200 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="flex items-start gap-3.5 min-w-0 flex-1 text-left cursor-pointer"
                  onClick={() => navigate(`/companies/${company.id}`)}
                  title={`View ${company.name}`}
                >
                  <div className="h-11 w-11 rounded-2xl bg-[#4A25E1]/10 dark:bg-white/10 flex items-center justify-center text-[#4A25E1] dark:text-[#754BFB] shrink-0 group-hover:scale-105 transition-all shadow-xs">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-text-primary group-hover:text-[#4A25E1] dark:group-hover:text-[#754BFB] transition-colors truncate">
                      {company.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-secondary">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(company.created_at)}</span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {!showArchived ? (
                    <>
                      <button
                        onClick={() => openEdit(company)}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-[#4A25E1] hover:bg-surface-2 transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setArchiveTargetId(company.id);
                          setArchivePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRestoreTargetId(company.id);
                          setRestorePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setHardDeleteTargetId(company.id);
                          setHardDeletePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Bar */}
      <div className="rounded-2xl border border-border/80 bg-surface p-3 px-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span>
            Showing {meta ? (meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1) : 0} to{" "}
            {meta ? Math.min(meta.page * meta.limit, meta.total) : 0} of {meta?.total ?? 0} entries
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
              {[24, 48, 60, 100].map((val) => (
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
            disabled={!meta || meta.page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-xl shadow-xs"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-xs font-semibold text-text-primary px-2">
            Page {meta?.page ?? 1} of {meta?.totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!meta || meta.page >= (meta.totalPages || 1)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl shadow-xs"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setEditingId(null);
            setName("");
          }
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">
              {editingId ? "Edit Company" : "Add Company"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              if (editingId) {
                updateMutation.mutate();
              } else {
                createMutation.mutate();
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="company-name" className="text-xs font-semibold">
                Company Name *
              </Label>
              <Input
                id="company-name"
                autoFocus
                placeholder="e.g. Pfizer, GSK, Abbott"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="brand"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="rounded-xl"
              >
                {editingId ? "Save Changes" : "Create Company"}
              </Button>
            </div>
          </form>
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
        title="Archive Company"
        description="Enter admin password to archive this company."
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
        title="Restore Company"
        description="Enter admin password to restore this archived company."
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
        title="Delete Company Permanently"
        description="This action cannot be undone. Enter admin password to permanently delete this company."
        confirmLabel="Delete Permanently"
        loading={hardDeleteMutation.isPending}
        onConfirm={() => {
          if (hardDeleteTargetId) hardDeleteMutation.mutate(hardDeleteTargetId);
        }}
      />
    </div>
  );
}