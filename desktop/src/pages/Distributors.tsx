import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Pencil, Trash2, LayoutGrid, List, ChevronLeft, ChevronRight, Archive, RotateCcw, ArrowUpDown } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
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
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import { ShortcutHint } from "@/components/shared/Kbd";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import ExportButton from "@/components/shared/ExportButton";
import type { Distributor } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";

export default function Distributors() {
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
  const [form, setForm] = useState({
    name: "",
    salesmanName: "",
    salesmanContact: "",
    deliveryManName: "",
    deliveryManContact: "",
  });
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const searchRef = useRef<HTMLInputElement>(null);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit, showArchived, sortBy, sortOrder]);

  const { data, isLoading } = useQuery({
    queryKey: ["distributors", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.distributors.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        archived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const distributors = data?.data ?? [];
  const meta = data?.meta;

  const createMutation = useMutation({
    mutationFn: () => api.distributors.create(form),
    onSuccess: () => {
      toast.success("Distributor created");
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
      setOpen(false);
      setForm({
        name: "",
        salesmanName: "",
        salesmanContact: "",
        deliveryManName: "",
        deliveryManContact: "",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.distributors.update(editingId!, form),
    onSuccess: () => {
      toast.success("Distributor updated");
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
      setOpen(false);
      setEditingId(null);
      setForm({
        name: "",
        salesmanName: "",
        salesmanContact: "",
        deliveryManName: "",
        deliveryManContact: "",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.distributors.archive(id),
    onSuccess: () => {
      toast.success("Distributor archived");
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
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
    mutationFn: (id: string) => api.distributors.restore(id),
    onSuccess: () => {
      toast.success("Distributor restored");
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
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
    mutationFn: (id: string) => api.distributors.hardDelete(id),
    onSuccess: () => {
      toast.success("Distributor permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
  });

  function handleExportPDF() {
    downloadPDF(
      `distributors_${new Date().toISOString().split("T")[0]}.pdf`,
      "Distributors List",
      ["Proprietor", "Salesman", "Salesman Contact", "Delivery Man", "Delivery Man Contact"],
      distributors.map((d: Distributor) => [
        d.name,
        d.salesman_name,
        d.salesman_contact,
        d.delivery_man_name,
        d.delivery_man_contact,
      ])
    );
  }
  function handleExportCSV() {
    downloadCSV(
      `distributors_${new Date().toISOString().split("T")[0]}.csv`,
      ["Proprietor", "Salesman", "Salesman Contact", "Delivery Man", "Delivery Man Contact"],
      distributors.map((d: Distributor) => [
        d.name,
        d.salesman_name,
        d.salesman_contact,
        d.delivery_man_name,
        d.delivery_man_contact,
      ])
    );
  }

  useModuleShortcuts({
    onAdd: openAdd,
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  function openAdd() {
    setEditingId(null);
    setForm({
      name: "",
      salesmanName: "",
      salesmanContact: "",
      deliveryManName: "",
      deliveryManContact: "",
    });
    setOpen(true);
  }

  function openEdit(d: Distributor) {
    setEditingId(d.id);
    setForm({
      name: d.name || "",
      salesmanName: d.salesman_name || "",
      salesmanContact: d.salesman_contact || "",
      deliveryManName: d.delivery_man_name || "",
      deliveryManContact: d.delivery_man_contact || "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Distributors & Suppliers"
        description="Supplier network, field salesmen, and delivery logistics"
        action={{
          label: (
            <>
              <span>Add Distributor</span>
              <ShortcutHint shortcut="Mod+N" />
            </>
          ),
          onClick: openAdd,
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              autoFocus
              ref={searchRef}
              placeholder="Search distributors or salesmen..."
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
          <ExportButton type="pdf" onClick={handleExportPDF} />
          <ExportButton type="csv" onClick={handleExportCSV} />
          <div className="flex items-center border border-border/80 rounded-xl overflow-hidden bg-surface shadow-xs p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                viewMode === "grid"
                  ? "bg-[#4A25E1] text-white shadow-xs"
                  : "text-text-secondary hover:bg-surface-2"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                viewMode === "list"
                  ? "bg-[#4A25E1] text-white shadow-xs"
                  : "text-text-secondary hover:bg-surface-2"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <DataTable
          columns={[
            {
              key: "name",
              sortKey: "name",
              sortable: true,
              header: "Proprietor / Distributor",
              cell: (d: Distributor) => (
                <span className="font-semibold text-text-primary">{d.name || "—"}</span>
              ),
            },
            {
              key: "salesman_name",
              sortKey: "salesmanName",
              sortable: true,
              header: "Salesman",
              cell: (d: Distributor) => (
                <span className="text-text-secondary font-medium">{d.salesman_name || "—"}</span>
              ),
            },
            {
              key: "salesman_contact",
              header: "Salesman Contact",
              cell: (d: Distributor) => (
                <span className="font-mono text-xs text-text-secondary bg-surface-2 px-2 py-0.5 rounded-lg border border-border">
                  {d.salesman_contact || "—"}
                </span>
              ),
            },
            {
              key: "delivery_man_name",
              sortKey: "deliveryManName",
              sortable: true,
              header: "Delivery Man",
              cell: (d: Distributor) => (
                <span className="text-text-secondary font-medium">{d.delivery_man_name || "—"}</span>
              ),
            },
            {
              key: "delivery_man_contact",
              header: "Delivery Contact",
              cell: (d: Distributor) => (
                <span className="font-mono text-xs text-text-secondary bg-surface-2 px-2 py-0.5 rounded-lg border border-border">
                  {d.delivery_man_contact || "—"}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              cell: (d: Distributor) => (
                <div className="flex items-center gap-1 justify-end">
                  {!showArchived ? (
                    <>
                      <button
                        onClick={() => openEdit(d)}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-[#4A25E1] hover:bg-surface-2 transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setArchiveTargetId(d.id);
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
                          setRestoreTargetId(d.id);
                          setRestorePasswordOpen(true);
                        }}
                        className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setHardDeleteTargetId(d.id);
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
              ),
            },
          ]}
          data={distributors}
          loading={isLoading}
          keyExtractor={(d: Distributor) => d.id}
          emptyMessage={showArchived ? "No archived distributors found" : "No distributors found"}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))
          ) : distributors.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-sm text-text-secondary">
              {showArchived ? "No archived distributors found" : "No distributors found"}
            </div>
          ) : (
            distributors.map((dist: Distributor) => (
              <div
                key={dist.id}
                className="rounded-2xl border border-border/80 bg-surface p-5 hover:border-[#4A25E1]/40 hover:shadow-md transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-bold text-sm text-text-primary group-hover:text-[#4A25E1] dark:group-hover:text-[#754BFB] transition-colors truncate pr-2">
                      {dist.name || "Unnamed Distributor"}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {!showArchived ? (
                        <>
                          <button
                            onClick={() => openEdit(dist)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-[#4A25E1] hover:bg-surface-2 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setArchiveTargetId(dist.id);
                              setArchivePasswordOpen(true);
                            }}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                            title="Archive"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setRestoreTargetId(dist.id);
                              setRestorePasswordOpen(true);
                            }}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                            title="Restore"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setHardDeleteTargetId(dist.id);
                              setHardDeletePasswordOpen(true);
                            }}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                            title="Delete Permanently"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-2/40 border border-border/60">
                    <div>
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-0.5">
                        Salesman
                      </p>
                      <p className="text-xs text-text-primary font-medium truncate">
                        {dist.salesman_name || "—"}
                      </p>
                      <p className="text-[11px] text-text-secondary font-mono mt-0.5">
                        {dist.salesman_contact || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-0.5">
                        Delivery
                      </p>
                      <p className="text-xs text-text-primary font-medium truncate">
                        {dist.delivery_man_name || "—"}
                      </p>
                      <p className="text-[11px] text-text-secondary font-mono mt-0.5">
                        {dist.delivery_man_contact || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setEditingId(null);
          }
          setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Distributor" : "Add Distributor"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3">
            <div>
              <Label>Proprietor Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Proprietor / company name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Salesman Name</Label>
                <Input
                  value={form.salesmanName}
                  onChange={(e) => setForm({ ...form, salesmanName: e.target.value })}
                  placeholder="Salesman name"
                />
              </div>
              <div>
                <Label>Salesman Contact</Label>
                <div className="flex">
                  <span className="flex items-center justify-center px-2 bg-muted border border-r-0 border-border rounded-l-md text-xs text-text-secondary">
                    +92
                  </span>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={form.salesmanContact.replace(/^\+92/, "")}
                    onChange={(e) => {
                      const num = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setForm({ ...form, salesmanContact: num ? `+92${num}` : "" });
                    }}
                    placeholder="3001234567"
                    className="rounded-l-none"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Delivery Man Name</Label>
                <Input
                  value={form.deliveryManName}
                  onChange={(e) => setForm({ ...form, deliveryManName: e.target.value })}
                  placeholder="Delivery man name"
                />
              </div>
              <div>
                <Label>Delivery Man Contact</Label>
                <div className="flex">
                  <span className="flex items-center justify-center px-2 bg-muted border border-r-0 border-border rounded-l-md text-xs text-text-secondary">
                    +92
                  </span>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={form.deliveryManContact.replace(/^\+92/, "")}
                    onChange={(e) => {
                      const num = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setForm({ ...form, deliveryManContact: num ? `+92${num}` : "" });
                    }}
                    placeholder="3001234567"
                    className="rounded-l-none"
                  />
                </div>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={createMutation.isPending || updateMutation.isPending}
              onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Update Distributor"
                  : "Add Distributor"}
            </Button>
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
        title="Archive Distributor"
        description="Enter admin password to archive this distributor."
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
        title="Restore Distributor"
        description="Enter admin password to restore this archived distributor."
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
        title="Delete Distributor Permanently"
        description="This action cannot be undone. Enter admin password to permanently delete this distributor."
        confirmLabel="Delete Permanently"
        loading={hardDeleteMutation.isPending}
        onConfirm={() => {
          if (hardDeleteTargetId) hardDeleteMutation.mutate(hardDeleteTargetId);
        }}
      />
    </div>
  );
}