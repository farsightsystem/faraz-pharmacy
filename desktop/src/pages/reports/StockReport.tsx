import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import KPICard from "@/components/reports/KPICard";
import ExportButtons from "@/components/reports/ExportButtons";
import DataTable from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Product } from "@/types";

type StockStatus = "all" | "in_stock" | "low_stock" | "out_of_stock";

function getStockStatus(p: Product): "in_stock" | "low_stock" | "out_of_stock" {
  if (p.stock_qty === 0) return "out_of_stock";
  if (p.stock_qty <= 5) return "low_stock";
  return "in_stock";
}

function StockStatusIndicator({ status }: { status: string }) {
  if (status === "in_stock")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" /> In Stock
      </span>
    );
  if (status === "low_stock")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Low Stock
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Out of Stock
    </span>
  );
}

export default function StockReport() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StockStatus>("all");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: api.products.list,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  });

  const filteredProducts = useMemo(() => {
    return products.filter((p: Product) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search);
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      const status = getStockStatus(p);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const totalProducts = products.length;
  const totalUnits = products.reduce((sum: number, p: Product) => sum + p.stock_qty, 0);
  const stockValue = products.reduce(
    (sum: number, p: Product) => sum + p.stock_qty * p.purchase_price,
    0
  );
  const lowStockCount = products.filter((p: Product) => getStockStatus(p) === "low_stock").length;
  const outOfStockCount = products.filter(
    (p: Product) => getStockStatus(p) === "out_of_stock"
  ).length;

  function handleReset() {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
  }

  function handlePDF() {
    generatePDF({
      title: "Stock Report",
      summary: [
        { label: "Total Products", value: String(totalProducts) },
        { label: "Total Units", value: String(totalUnits) },
        { label: "Stock Value", value: formatCurrency(stockValue) },
        { label: "Low Stock", value: String(lowStockCount) },
      ],
      headers: [
        "Product",
        "Barcode",
        "Category",
        "Purchase Price",
        "Sale Price",
        "Quantity",
        "Stock Value",
        "Status",
      ],
      rows: filteredProducts.map((p: Product) => [
        p.name,
        p.barcode,
        p.category || "—",
        formatCurrency(p.purchase_price),
        formatCurrency(p.sale_price),
        p.stock_qty,
        formatCurrency(p.stock_qty * p.purchase_price),
        getStockStatus(p).replace("_", " "),
      ]),
      filename: `stock_report_${new Date().toISOString().split("T")[0]}.pdf`,
    });
  }

  function handleExcel() {
    downloadExcelFile(
      `stock_report_${new Date().toISOString().split("T")[0]}.xlsx`,
      [
        "Product",
        "Barcode",
        "Category",
        "Purchase Price",
        "Sale Price",
        "Quantity",
        "Stock Value",
        "Status",
      ],
      filteredProducts.map((p: Product) => [
        p.name,
        p.barcode,
        p.category || "—",
        p.purchase_price,
        p.sale_price,
        p.stock_qty,
        p.stock_qty * p.purchase_price,
        getStockStatus(p).replace("_", " "),
      ])
    );
  }

  const columns = [
    {
      key: "name",
      header: "Product",
      cell: (p: Product) => <span className="font-medium text-text-primary">{p.name}</span>,
    },
    {
      key: "barcode",
      header: "Barcode",
      cell: (p: Product) => (
        <span className="font-mono text-xs text-text-secondary">{p.barcode}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (p: Product) => <span className="text-text-secondary">{p.category || "—"}</span>,
    },
    {
      key: "purchase_price",
      header: "Purchase",
      cell: (p: Product) => (
        <span className="font-mono text-sm">{formatCurrency(p.purchase_price)}</span>
      ),
    },
    {
      key: "sale_price",
      header: "Sale",
      cell: (p: Product) => (
        <span className="font-mono text-sm">{formatCurrency(p.sale_price)}</span>
      ),
    },
    {
      key: "stock_qty",
      header: "Qty",
      cell: (p: Product) => (
        <span
          className={`font-mono font-semibold ${p.stock_qty === 0 ? "text-danger" : p.stock_qty <= 5 ? "text-warning" : ""}`}
        >
          {p.stock_qty}
        </span>
      ),
    },
    {
      key: "stock_value",
      header: "Value",
      cell: (p: Product) => (
        <span className="font-mono text-sm">{formatCurrency(p.stock_qty * p.purchase_price)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p: Product) => <StockStatusIndicator status={getStockStatus(p)} />,
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Stock Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Monitor inventory levels and stock value
          </p>
        </div>
        <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
      </div>

      <div className="relative z-20 flex items-center gap-3 mb-6 p-4 bg-surface rounded-2xl border border-border/80 shadow-xs flex-wrap">
        <Input
          placeholder="Search product or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-56 rounded-xl bg-surface border-border/80 text-xs shadow-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-9 rounded-xl bg-surface border-border/80 text-xs shadow-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c: { id: string; name: string }) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StockStatus)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Stock Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-9 text-text-secondary" onClick={handleReset}>
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Products"
          value={totalProducts}
          icon={<Package className="h-4 w-4" />}
        />
        <KPICard
          title="Total Units"
          value={totalUnits.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
        <KPICard
          title="Stock Value"
          value={formatCurrency(stockValue)}
          icon={<Package className="h-4 w-4" />}
          valueClassName="text-accent"
        />
        <KPICard
          title="Low Stock"
          value={lowStockCount + outOfStockCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          valueClassName={lowStockCount + outOfStockCount > 0 ? "text-warning" : ""}
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredProducts}
          loading={isLoading}
          keyExtractor={(p: Product) => p.id}
          emptyMessage="No products found"
        />
      </div>
    </div>
  );
}
