import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Phone, MapPin, Pencil, Trash2, LayoutGrid, List, Eye, Archive, RotateCcw, ArrowUpDown } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { downloadCSV, downloadPDF } from "@/lib/export";
import PasswordConfirmDialog from "@/components/shared/PasswordConfirmDialog";
import ExportButton from "@/components/shared/ExportButton";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import { ShortcutHint } from "@/components/shared/Kbd";
import type { Customer } from "@/types";

export default function Customers() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archivePasswordOpen, setArchivePasswordOpen] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restorePasswordOpen, setRestorePasswordOpen] = useState(false);
  const [hardDeleteTargetId, setHardDeleteTargetId] = useState<string | null>(null);
  const [hardDeletePasswordOpen, setHardDeletePasswordOpen] = useState(false);
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

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit, showArchived, sortBy, sortOrder]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["customers", page, limit, debouncedSearch, showArchived, sortBy, sortOrder],
    queryFn: () =>
      api.customers.listPaginated({
        page,
        limit,
        search: debouncedSearch,
        archived: showArchived,
        sortBy,
        sortOrder,
      }),
  });

  const customers = paginatedData?.data || [];
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const createMutation = useMutation({
    mutationFn: () => api.customers.create({ name, phone, address, fatherName, fatherPhone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setName("");
      setPhone("");
      setAddress("");
      setFatherName("");
      setFatherPhone("");
      toast.success("Customer created");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.customers.update(editingId!, { name, phone, address, fatherName, fatherPhone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setEditingId(null);
      setName("");
      setPhone("");
      setAddress("");
      setFatherName("");
      setFatherPhone("");
      toast.success("Customer updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.customers.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer archived");
      setArchivePasswordOpen(false);
      setArchiveTargetId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to archive customer");
      setArchivePasswordOpen(false);
      setArchiveTargetId(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.customers.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer restored");
      setRestorePasswordOpen(false);
      setRestoreTargetId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to restore customer");
      setRestorePasswordOpen(false);
      setRestoreTargetId(null);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.hardDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer permanently deleted");
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete customer");
      setHardDeletePasswordOpen(false);
      setHardDeleteTargetId(null);
    },
  });



  function openAdd() {
    setEditingId(null);
    setName("");
    setPhone("");
    setAddress("");
    setFatherName("");
    setFatherPhone("");
    setOpen(true);
  }

  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) {
      openAdd();
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setFatherName(c.father_name ?? "");
    setFatherPhone(c.father_phone ?? "");
    setOpen(true);
  }

  const columns = [
    {
      key: "name",
      sortKey: "name",
      sortable: true,
      header: "Name",
      cell: (c: Customer) => <span className="font-medium text-text-primary">{c.name}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (c: Customer) => (
        <span className="font-mono text-xs text-text-secondary">{c.phone}</span>
      ),
    },
    {
      key: "father",
      header: "Father",
      cell: (c: Customer) => (
        <span className="text-xs text-text-secondary truncate max-w-[220px] inline-block">
          {c.father_name ? c.father_name : "\u2014"}
          {c.father_phone ? ` \u00b7 ${c.father_phone}` : ""}
        </span>
      ),
    },
    {
      key: "address",
      header: "Address",
      cell: (c: Customer) => (
        <span className="text-xs text-text-secondary truncate max-w-[180px] inline-block">
          {c.address || "\u2014"}
        </span>
      ),
    },
    {
      key: "total_purchases",
      header: "Purchases",
      cell: (c: Customer) => (
        <span className="font-mono font-medium">{c.total_purchases ?? 0}</span>
      ),
    },
    {
      key: "outstanding_arrear",
      header: "Arrear",
      cell: (c: Customer) => {
        const arrear = c.outstanding_arrear ?? 0;
        return (
          <span
            className={`font-mono font-medium ${arrear > 0 ? "text-warning" : "text-text-secondary"}`}
          >
            {arrear > 0 ? formatCurrency(arrear) : "—"}
          </span>
        );
      },
    },
    {
      key: "last_purchase",
      header: "Last Purchase",
      cell: (c: Customer) => (
        <span className="text-xs text-text-secondary">
          {c.last_purchase ? formatDate(c.last_purchase) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (c: Customer) => (
        <div className="flex items-center gap-1 justify-end">
          {!showArchived ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(c);
                }}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-brand hover:bg-brand/10 transition-colors"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setArchiveTargetId(c.id);
                  setArchivePasswordOpen(true);
                }}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors"
                title="Archive"
              >
                <Archive className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRestoreTargetId(c.id);
                  setRestorePasswordOpen(true);
                }}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                title="Restore"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setHardDeleteTargetId(c.id);
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

  function handleExportPDF() {
    downloadPDF(
      `customers_${new Date().toISOString().split("T")[0]}.pdf`,
      "Customers List",
      [
        "Name",
        "Phone",
        "Father Name",
        "Father Phone",
        "Address",
        "Purchases",
        "Arrear",
        "Last Purchase",
      ],
      customers.map((c: Customer) => [
        c.name,
        c.phone,
        c.father_name || "",
        c.father_phone || "",
        c.address,
        c.total_purchases || 0,
        c.outstanding_arrear || 0,
        c.last_purchase || "",
      ])
    );
  }
  function handleExportCSV() {
    downloadCSV(
      `customers_${new Date().toISOString().split("T")[0]}.csv`,
      [
        "Name",
        "Phone",
        "Father Name",
        "Father Phone",
        "Address",
        "Purchases",
        "Arrear",
        "Last Purchase",
      ],
      customers.map((c: Customer) => [
        c.name,
        c.phone,
        c.father_name || "",
        c.father_phone || "",
        c.address,
        c.total_purchases || 0,
        c.outstanding_arrear || 0,
        c.last_purchase || "",
      ])
    );
  }

  useModuleShortcuts({
    onAdd: openAdd,
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Customer Directory"
        description="Customer accounts, contact directories, and ledger balances"
        action={{
          label: (
            <>
              <span>Add Customer</span>
              <ShortcutHint shortcut="Mod+N" />
            </>
          ),
          onClick: openAdd,
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
            <Input
              autoFocus
              ref={searchRef}
              placeholder="Search by customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          columns={columns}
          data={customers}
          loading={isLoading}
          keyExtractor={(c: Customer) => c.id}
          onRowClick={(c: Customer) => navigate(`/customers/${c.id}`)}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-surface-2 animate-pulse" />
            ))
          ) : customers.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-sm text-text-secondary">
              {search ? "No customers match your search" : "No customers registered yet."}
            </div>
          ) : (
            customers.map((c: Customer) => (
              <div
                key={c.id}
                className="group rounded-2xl border border-border/80 bg-surface p-5 shadow-xs hover:shadow-md hover:border-[#4A25E1]/40 transition-all duration-200 cursor-pointer flex flex-col justify-between"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div>
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="h-11 w-11 rounded-2xl bg-[#4A25E1]/10 dark:bg-white/10 text-[#4A25E1] dark:text-[#754BFB] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-all">
                      {c.name?.slice(0, 2).toUpperCase() || "CU"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-text-primary group-hover:text-[#4A25E1] dark:group-hover:text-[#754BFB] transition-colors truncate">
                        {c.name}
                      </h3>
                      <p className="text-xs text-text-secondary mt-0.5 font-mono">{c.phone || "No phone"}</p>
                      {(c.father_name || c.father_phone) && (
                        <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                          S/O: {c.father_name || "—"}
                          {c.father_phone ? ` · ${c.father_phone}` : ""}
                        </p>
                      )}
                      {c.address && (
                        <p className="flex items-center gap-1 text-[11px] text-text-secondary mt-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{c.address}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!showArchived ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(c);
                            }}
                            className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-[#4A25E1] hover:bg-surface-2 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveTargetId(c.id);
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setRestoreTargetId(c.id);
                              setRestorePasswordOpen(true);
                            }}
                            className="h-8 w-8 rounded-xl flex items-center justify-center text-text-secondary hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                            title="Restore"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHardDeleteTargetId(c.id);
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

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">
                    Sales: <span className="font-bold text-text-primary">{c.total_purchases ?? 0}</span>
                  </span>
                  {(c.outstanding_arrear ?? 0) > 0 ? (
                    <span className="text-danger font-mono font-bold bg-danger/10 px-2 py-0.5 rounded-full text-[11px]">
                      Arrear: {formatCurrency(c.outstanding_arrear)}
                    </span>
                  ) : (
                    <span className="text-success font-medium text-[11px]">No debt</span>
                  )}
                </div>
              </div>
            ))
          )}
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

      <PasswordConfirmDialog
        open={archivePasswordOpen}
        onOpenChange={(v) => {
          if (!v) {
            setArchivePasswordOpen(false);
            setArchiveTargetId(null);
          }
        }}
        title="Archive Customer"
        description="Enter admin password to archive this customer. Customers with pending arrears cannot be archived."
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
        title="Restore Customer"
        description="Enter admin password to restore this archived customer."
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
        title="Delete Customer Permanently"
        description="This action cannot be undone. Enter admin password to permanently delete this customer."
        confirmLabel="Delete Permanently"
        loading={hardDeleteMutation.isPending}
        onConfirm={() => {
          if (hardDeleteTargetId) hardDeleteMutation.mutate(hardDeleteTargetId);
        }}
      />

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
            <DialogTitle>{editingId ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <div className="flex">
                <span className="flex items-center justify-center px-2 bg-muted border border-r-0 border-border rounded-l-md text-xs text-text-secondary">
                  +92
                </span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={phone.replace(/^\+92/, "")}
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(num ? `+92${num}` : "");
                  }}
                  placeholder="3001234567"
                  className="rounded-l-none"
                />
              </div>
            </div>
            <div>
              <Label>Father Name</Label>
              <Input
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                placeholder="Father name (optional)"
              />
            </div>
            <div>
              <Label>Father Phone No</Label>
              <div className="flex">
                <span className="flex items-center justify-center px-2 bg-muted border border-r-0 border-border rounded-l-md text-xs text-text-secondary">
                  +92
                </span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fatherPhone.replace(/^\+92/, "")}
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setFatherPhone(num ? `+92${num}` : "");
                  }}
                  placeholder="3001234567"
                  className="rounded-l-none"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address (optional)"
              />
            </div>
            <Button
              className="w-full"
              disabled={!name || createMutation.isPending || updateMutation.isPending}
              onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Update Customer"
                  : "Add Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
