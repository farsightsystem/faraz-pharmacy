import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Users, Clock } from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/reports/DateRangePicker";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Arrear } from "@/types";

type ArrearStatus = "all" | "pending" | "settled";

function getArrearStatus(a: Arrear): "current" | "due_soon" | "overdue" | "critical" | "settled" {
  if (a.status === "settled") return "settled";
  const days = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
  if (days > 60) return "critical";
  if (days > 30) return "overdue";
  if (days > 14) return "due_soon";
  return "current";
}

function ArrearStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; dot: string }> = {
    current: { label: "Current", className: "bg-success/10 text-success", dot: "bg-success" },
    due_soon: { label: "Due Soon", className: "bg-warning/10 text-warning", dot: "bg-warning" },
    overdue: { label: "Overdue", className: "bg-danger/10 text-danger", dot: "bg-danger" },
    critical: { label: "Critical", className: "bg-danger/10 text-danger", dot: "bg-danger" },
    settled: { label: "Settled", className: "bg-success/10 text-success", dot: "bg-success" },
  };
  const c = config[status] || config.current;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function ArrearsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [statusFilter, setStatusFilter] = useState<ArrearStatus>("all");

  const { data: arrears = [], isLoading } = useQuery({
    queryKey: ["arrears", dateRange.from, dateRange.to, statusFilter],
    queryFn: () =>
      api.arrears.list({
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  const filteredArrears = useMemo(() => {
    return arrears.filter((a: Arrear) => {
      const inDateRange =
        a.created_at >= dateRange.from && a.created_at <= dateRange.to + "T23:59:59";
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      return inDateRange && matchesStatus;
    });
  }, [arrears, dateRange, statusFilter]);

  const totalOutstanding = filteredArrears
    .filter((a: Arrear) => a.status === "pending")
    .reduce((sum: number, a: Arrear) => sum + a.balance_due, 0);
  const customersWithBalance = new Set(
    filteredArrears
      .filter((a: Arrear) => a.status === "pending")
      .map((a: Arrear) => a.customer_name)
  ).size;
  const overdue = filteredArrears
    .filter((a: Arrear) => {
      const d = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
      return a.status === "pending" && d > 30;
    })
    .reduce((sum: number, a: Arrear) => sum + a.balance_due, 0);

  function handleReset() {
    setDateRange({
      from: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
      to: new Date().toISOString().split("T")[0],
    });
    setStatusFilter("all");
  }

  function handlePDF() {
    generatePDF({
      title: "Arrears Report",
      dateRange,
      summary: [
        { label: "Outstanding", value: formatCurrency(totalOutstanding) },
        { label: "Customers", value: String(customersWithBalance) },
        { label: "Overdue", value: formatCurrency(overdue) },
      ],
      headers: ["Customer", "Total", "Paid", "Outstanding", "Last Payment", "Status"],
      rows: filteredArrears.map((a: Arrear) => [
        a.customer_name || "—",
        formatCurrency(a.total_bill),
        formatCurrency(a.amount_paid),
        formatCurrency(a.balance_due),
        a.last_payment_date ? formatDateTime(a.last_payment_date) : "—",
        getArrearStatus(a),
      ]),
      filename: `arrears_report_${dateRange.from}_${dateRange.to}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `arrears_report_${dateRange.from}_${dateRange.to}.xlsx`,
      ["Customer", "Total", "Paid", "Outstanding", "Last Payment", "Status"],
      filteredArrears.map((a: Arrear) => [
        a.customer_name || "—",
        a.total_bill,
        a.amount_paid,
        a.balance_due,
        a.last_payment_date ? formatDateTime(a.last_payment_date) : "—",
        getArrearStatus(a),
      ])
    );
  }

  const columns = [
    {
      key: "customer_name",
      header: "Customer",
      cell: (a: Arrear) => (
        <span className="font-medium text-text-primary">{a.customer_name || "—"}</span>
      ),
    },
    {
      key: "total_bill",
      header: "Total",
      cell: (a: Arrear) => <span className="font-mono">{formatCurrency(a.total_bill)}</span>,
    },
    {
      key: "amount_paid",
      header: "Paid",
      cell: (a: Arrear) => <span className="font-mono">{formatCurrency(a.amount_paid)}</span>,
    },
    {
      key: "balance_due",
      header: "Outstanding",
      cell: (a: Arrear) => (
        <span className="font-mono font-semibold text-danger">{formatCurrency(a.balance_due)}</span>
      ),
    },
    {
      key: "last_payment_date",
      header: "Last Payment",
      cell: (a: Arrear) => (
        <span className="font-mono text-xs text-text-secondary">
          {a.last_payment_date ? formatDateTime(a.last_payment_date) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a: Arrear) => <ArrearStatusBadge status={getArrearStatus(a)} />,
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Arrears Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Track outstanding balances and overdue accounts
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex items-center border border-border rounded-lg overflow-hidden h-9">
          {(["all", "pending", "settled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              {s === "all" ? "All" : s === "pending" ? "Pending" : "Settled"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="h-9 text-text-secondary" onClick={handleReset}>
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KPICard
          title="Total Outstanding"
          value={formatCurrency(totalOutstanding)}
          icon={<AlertTriangle className="h-4 w-4" />}
          valueClassName="text-danger"
        />
        <KPICard
          title="Customers With Balance"
          value={customersWithBalance}
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="Overdue"
          value={formatCurrency(overdue)}
          icon={<Clock className="h-4 w-4" />}
          valueClassName="text-warning"
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredArrears}
          loading={isLoading}
          keyExtractor={(a: Arrear) => a.id}
          emptyMessage="No arrears found"
        />
      </div>
    </div>
  );
}
