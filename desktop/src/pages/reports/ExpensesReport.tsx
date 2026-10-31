import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, DollarSign, Receipt, TrendingDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/reports/DateRangePicker";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Expense } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";
import { EXPENSE_CATEGORIES } from "@/pages/Expenses";

export default function ExpensesReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  // Paginated table data
  const { data: expensesData, isLoading } = useQuery({
    queryKey: ["expenses", "report", page, limit, debouncedSearch, dateRange.from, dateRange.to],
    queryFn: () =>
      api.expenses.listPaginated({
        page,
        limit,
        search: debouncedSearch || undefined,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      }),
  });

  const expenses = (expensesData?.data ?? []).filter((e: Expense) => {
    if (categoryFilter === "all") return true;
    return e.category?.toLowerCase() === categoryFilter.toLowerCase();
  });
  const meta = expensesData?.meta;

  // Summary data for KPIs and exports
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses", "summary", dateRange.from, dateRange.to],
    queryFn: () => api.expenses.list(),
  });

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((e: Expense) => {
      const inDateRange = e.date >= dateRange.from && e.date <= dateRange.to;
      const matchesCategory =
        categoryFilter === "all" ||
        e.category?.toLowerCase() === categoryFilter.toLowerCase();
      return inDateRange && matchesCategory;
    });
  }, [allExpenses, dateRange, categoryFilter]);

  const totalExpenses = filteredExpenses.reduce((sum: number, e: Expense) => sum + e.amount, 0);
  const totalEntries = filteredExpenses.length;
  const avgExpense = totalEntries > 0 ? totalExpenses / totalEntries : 0;
  const maxExpense = filteredExpenses.reduce((max: number, e: Expense) => Math.max(max, e.amount), 0);

  // Dynamically extract categories from allExpenses
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    allExpenses.forEach((e: Expense) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [allExpenses]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [dateRange, categoryFilter, debouncedSearch]);

  function handleReset() {
    setDateRange({
      from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
      to: new Date().toISOString().split("T")[0],
    });
    setCategoryFilter("all");
    setSearch("");
    setPage(1);
  }

  function handlePDF() {
    generatePDF({
      title: "Operating Expenses Report",
      dateRange,
      summary: [
        { label: "Total Expenses", value: formatCurrency(totalExpenses) },
        { label: "Total Entries", value: String(totalEntries) },
        { label: "Average Entry", value: formatCurrency(avgExpense) },
        { label: "Largest Single Expense", value: formatCurrency(maxExpense) },
      ],
      headers: ["Date", "Expense Title", "Category", "Amount", "Notes"],
      rows: filteredExpenses.map((e: Expense) => [
        formatDate(e.date),
        e.title,
        e.category || "General",
        formatCurrency(e.amount),
        e.notes || "\u2014",
      ]),
      filename: `expenses_report_${dateRange.from}_${dateRange.to}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `expenses_report_${dateRange.from}_${dateRange.to}.xlsx`,
      ["Date", "Expense Title", "Category", "Amount", "Notes"],
      filteredExpenses.map((e: Expense) => [
        formatDate(e.date),
        e.title,
        e.category || "General",
        e.amount,
        e.notes || "\u2014",
      ])
    );
  }

  const columns = [
    {
      key: "date",
      header: "Date",
      cell: (e: Expense) => (
        <span className="font-mono text-xs text-text-secondary">{formatDate(e.date)}</span>
      ),
    },
    {
      key: "title",
      header: "Expense Title",
      cell: (e: Expense) => (
        <span className="font-medium text-text-primary text-xs">{e.title}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (e: Expense) => (
        <Badge variant="outline" className="text-xs bg-surface-2 text-text-secondary font-medium">
          {e.category || "General"}
        </Badge>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      cell: (e: Expense) => (
        <span className="text-xs text-text-secondary line-clamp-1 max-w-[200px]">
          {e.notes || "\u2014"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      cell: (e: Expense) => (
        <span className="font-mono text-xs font-bold text-danger">
          {formatCurrency(e.amount)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Operating Expenses Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Track business expenditures, operational overhead, and utility outlays
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-9 rounded-xl bg-surface border-border/80 text-xs shadow-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Array.from(new Set([...EXPENSE_CATEGORIES, ...existingCategories])).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <Input
            placeholder="Search expenses by title or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-surface border-border/80 text-xs shadow-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-xl text-text-secondary hover:text-text-primary cursor-pointer"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          icon={<Wallet className="h-4 w-4" />}
          valueClassName="text-danger"
        />
        <KPICard
          title="Expense Entries"
          value={totalEntries}
          icon={<Receipt className="h-4 w-4" />}
        />
        <KPICard
          title="Avg Per Entry"
          value={formatCurrency(avgExpense)}
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <KPICard
          title="Largest Outlay"
          value={formatCurrency(maxExpense)}
          icon={<DollarSign className="h-4 w-4" />}
          valueClassName="text-warning"
        />
      </div>

      <div className="rounded-2xl border border-border/80 bg-surface overflow-hidden shadow-xs">
        <DataTable
          columns={columns}
          data={expenses}
          loading={isLoading}
          keyExtractor={(e: Expense) => e.id}
          emptyMessage="No expenses recorded in this period"
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-text-secondary">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-8 rounded-lg cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-text-secondary px-2">
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
              className="h-8 rounded-lg cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}