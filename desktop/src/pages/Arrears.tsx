import { useState, useRef, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle,
  Lock,
  Printer,
  History,
  Search,
  FileText,
  Users,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ExportButton from "@/components/shared/ExportButton";
import StatCard from "@/components/shared/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { downloadPDF, downloadCSV } from "@/lib/export";
import { useModuleShortcuts } from "@/hooks/useModuleShortcuts";
import { api } from "@/lib/api";
import ArrearLedgerDrawer from "@/components/arrears/ArrearLedgerDrawer";
import ArrearPaymentReceiptDialog from "@/components/arrears/ArrearPaymentReceiptDialog";
import type { CustomerArrearSummary, CustomerPaymentReceipt, Customer } from "@/types";

export default function Arrears() {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ customerId: "", totalBill: "", amountPaid: "" });

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState<CustomerPaymentReceipt | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>("latest_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const debouncedSearch = useDebounce(search, 300);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter, limit, sortBy, sortOrder]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["arrears-by-customer", filter, page, limit, debouncedSearch, sortBy, sortOrder],
    queryFn: () =>
      api.arrears.listByCustomer({
        status: filter === "all" ? undefined : filter,
        page,
        limit,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const customerLedgers = paginatedData?.data || [];
  const meta = paginatedData?.meta || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: api.customers.list,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.arrears.create({
        customerId: form.customerId,
        totalBill: Number(form.totalBill),
        amountPaid: form.amountPaid ? Number(form.amountPaid) : 0,
      }),
    onSuccess: (newArrear) => {
      toast.success("Arrear entry created");
      queryClient.invalidateQueries({ queryKey: ["arrears-by-customer"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpenAdd(false);
      setForm({ customerId: "", totalBill: "", amountPaid: "" });
      setSelectedCustomerId(newArrear.customer_id);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Calculate high-level summary cards
  const totalOutstanding = useMemo(
    () => customerLedgers.reduce((s: number, c: CustomerArrearSummary) => s + c.balance_due, 0),
    [customerLedgers]
  );
  const customersWithDues = useMemo(
    () => customerLedgers.filter((c: CustomerArrearSummary) => c.balance_due > 0).length,
    [customerLedgers]
  );

  const exportHeaders = [
    "Customer",
    "Phone",
    "Father Name",
    "Total Credit",
    "Amount Paid",
    "Balance Due",
    "Pending Bills",
    "Status",
  ];
  const exportRows = customerLedgers.map((c: CustomerArrearSummary) => [
    c.customer_name,
    c.phone || "—",
    c.father_name || "—",
    formatCurrency(c.total_bill),
    formatCurrency(c.amount_paid),
    formatCurrency(c.balance_due),
    c.pending_invoices,
    c.status === "pending" ? "Pending Dues" : "Settled",
  ]);

  function handleExportPDF() {
    downloadPDF("arrears_customers.pdf", "Customer Arrears Ledger Report", exportHeaders, exportRows);
  }

  function handleExportCSV() {
    downloadCSV("arrears_customers.csv", exportHeaders, exportRows);
  }

  useModuleShortcuts({
    onAdd: () => {
      setForm({ customerId: "", totalBill: "", amountPaid: "" });
      setOpenAdd(true);
    },
    onSearch: () => searchRef.current?.focus(),
    onExportPDF: handleExportPDF,
    onExportCSV: handleExportCSV,
  });

  const columns = [
    {
      key: "customer_name",
      header: "Customer",
      sortable: true,
      sortKey: "name",
      cell: (row: CustomerArrearSummary) => (
        <div
          onClick={() => setSelectedCustomerId(row.customer_id)}
          className="cursor-pointer group space-y-0.5"
        >
          <span className="font-bold text-text-primary group-hover:text-brand transition-colors block text-xs">
            {row.customer_name}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            {row.phone && <span className="font-mono">{row.phone}</span>}
            {row.father_name && <span>• S/O {row.father_name}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "total_bill",
      header: "Total Credit",
      sortable: true,
      sortKey: "total_bill",
      cell: (row: CustomerArrearSummary) => (
        <span className="font-mono text-xs">{formatCurrency(row.total_bill)}</span>
      ),
    },
    {
      key: "amount_paid",
      header: "Total Paid",
      cell: (row: CustomerArrearSummary) => (
        <span className="font-mono text-xs text-success">{formatCurrency(row.amount_paid)}</span>
      ),
    },
    {
      key: "balance_due",
      header: "Balance Due",
      sortable: true,
      sortKey: "balance_due",
      cell: (row: CustomerArrearSummary) => (
        <span className="font-mono text-xs font-bold text-warning">
          {formatCurrency(row.balance_due)}
        </span>
      ),
    },
    {
      key: "invoices",
      header: "Invoices",
      cell: (row: CustomerArrearSummary) => (
        <span className="text-[11px] text-text-secondary font-mono">
          {row.pending_invoices > 0 ? (
            <span className="text-warning font-semibold">{row.pending_invoices} Pending</span>
          ) : (
            <span className="text-success font-semibold">0 Pending</span>
          )}{" "}
          ({row.total_invoices} Total)
        </span>
      ),
    },
    {
      key: "latest_date",
      header: "Last Activity",
      sortable: true,
      sortKey: "latest_date",
      cell: (row: CustomerArrearSummary) => (
        <span className="font-mono text-[11px] text-text-secondary">
          {row.latest_date ? formatDate(row.latest_date) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row: CustomerArrearSummary) => <StatusBadge status={row.status} />,
      className: "text-center",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row: CustomerArrearSummary) => (
        <div className="flex items-center gap-1.5 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl text-xs gap-1 cursor-pointer font-semibold shadow-2xs"
            onClick={() => setSelectedCustomerId(row.customer_id)}
          >
            <FileText className="h-3.5 w-3.5 text-brand" />
            <span>Ledger</span>
          </Button>
          {row.balance_due > 0 && (
            <Button
              size="sm"
              variant="brand"
              className="h-8 rounded-xl text-xs gap-1 cursor-pointer font-semibold shadow-xs"
              onClick={() => setSelectedCustomerId(row.customer_id)}
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Pay</span>
            </Button>
          )}
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Customer Arrears & Khata"
        description="Customer-centric ledger, accumulated debt balances, and payment vouchers"
        action={{
          label: "Add Arrear Entry",
          onClick: () => {
            setForm({ customerId: "", totalBill: "", amountPaid: "" });
            setOpenAdd(true);
          },
          shortcut: "Mod+N",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Outstanding Debt"
          value={formatCurrency(totalOutstanding)}
          icon={<CreditCard className="h-5 w-5" />}
          subtitle="Total pending customer balances"
        />
        <StatCard
          title="Customers with Dues"
          value={customersWithDues}
          icon={<Users className="h-5 w-5" />}
          subtitle="Customers currently with active debt"
        />
        <StatCard
          title="Total Credit Customers"
          value={meta.total}
          icon={<FileText className="h-5 w-5" />}
          subtitle="Registered customer credit accounts"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              ref={searchRef}
              placeholder="Search by customer name, phone, or father name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-full border border-border/80 bg-surface shadow-xs text-xs focus-visible:ring-2 focus-visible:ring-[#4A25E1]/25"
            />
          </div>
          <Select
            value={sortBy === "latest_date" ? "recent" : (sortBy === "name" ? (sortOrder === "asc" ? "name_asc" : "name_desc") : (sortBy === "balance_due" ? "due_desc" : "custom"))}
            onValueChange={(val) => {
              if (val === "recent") { setSortBy("latest_date"); setSortOrder("desc"); }
              else if (val === "due_desc") { setSortBy("balance_due"); setSortOrder("desc"); }
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
              <SelectItem value="recent">Recent activity</SelectItem>
              <SelectItem value="due_desc">Balance due</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              {sortBy !== "latest_date" && sortBy !== "name" && sortBy !== "balance_due" && (
                <SelectItem value="custom">Sort: {sortBy} ({sortOrder})</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="pdf" onClick={handleExportPDF} />
          <ExportButton type="csv" onClick={handleExportCSV} />
        </div>
      </div>

      {/* Pill Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-surface border border-border/80 shadow-xs w-fit">
        {[
          { id: "all", label: "All Customer Ledgers" },
          { id: "pending", label: "Pending Dues Only" },
          { id: "settled", label: "Fully Settled" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setFilter(tab.id);
              setPage(1);
            }}
            className={cn(
              "text-xs font-semibold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer",
              filter === tab.id
                ? "bg-[#4A25E1] text-white shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Table */}
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={customerLedgers}
          loading={isLoading}
          keyExtractor={(c: CustomerArrearSummary) => c.customer_id}
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
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl shadow-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Customer Ledger Drawer (Slide-over) */}
      <ArrearLedgerDrawer
        open={!!selectedCustomerId}
        onOpenChange={(open) => {
          if (!open) setSelectedCustomerId(null);
        }}
        customerId={selectedCustomerId}
        onPaymentSuccess={(receipt) => {
          setPrintReceipt(receipt);
        }}
      />

      {/* Payment Receipt Voucher Dialog */}
      <ArrearPaymentReceiptDialog
        open={!!printReceipt}
        onOpenChange={(open) => {
          if (!open) setPrintReceipt(null);
        }}
        receipt={printReceipt}
      />

      {/* Manual Arrear Add Modal */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="max-w-md p-6 bg-surface border border-border/80 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add Customer Arrear Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Customer *</Label>
              <SearchableSelect
                options={customers.map((c: Customer) => ({
                  value: c.id,
                  label: `${c.name}${c.phone ? ` (${c.phone})` : ""}`,
                }))}
                value={form.customerId}
                onChange={(val) => setForm((f) => ({ ...f, customerId: val }))}
                placeholder="Select customer..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Total Bill Amount (PKR) *</Label>
              <Input
                type="number"
                min="1"
                placeholder="0"
                value={form.totalBill}
                onChange={(e) => setForm((f) => ({ ...f, totalBill: e.target.value }))}
                className="font-mono text-sm h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Initial Amount Paid (optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.amountPaid}
                onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                className="font-mono text-sm h-10 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" onClick={() => setOpenAdd(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                variant="brand"
                disabled={!form.customerId || !form.totalBill || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-xl shadow-xs"
              >
                {createMutation.isPending ? "Saving..." : "Create Arrear Entry"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
