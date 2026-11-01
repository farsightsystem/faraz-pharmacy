import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import {
  TrendingUp,
  AlertCircle,
  Package,
  Clock,
  ShoppingCart,
  Users,
  Wallet,
  ArrowRight,
  AlertTriangle,
  UserCheck,
  Sparkles,
  Receipt,
  Boxes,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import DonutChart from "@/components/dashboard/DonutChart";
import RecentSalesTable from "@/components/dashboard/RecentSalesTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: "easeOut" },
  }),
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: api.dashboard.stats,
  });

  const lowStockProducts = stats?.lowStockProducts ?? [];
  const expiringProducts = stats?.expiringProducts ?? [];
  const topCustomers = stats?.topCustomers ?? [];
  const pendingArrears = stats?.pendingArrears ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[340px] rounded-2xl" />
          <Skeleton className="h-[340px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Airnow Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-r from-white via-indigo-50/30 to-purple-50/20 dark:from-[#141724] dark:via-[#181c30] dark:to-[#141724] p-6 shadow-xs"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4A25E1]/10 dark:bg-white/10 text-[#4A25E1] dark:text-[#754BFB] text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Pharmacy Dashboard</span>
            </div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-text-primary tracking-tight">
              Good day, {user?.username || "Pharmacist"}! 👋
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              Your register has processed{" "}
              <span className="font-semibold text-text-primary">
                {formatCurrency(stats?.todayRevenue ?? 0)}
              </span>{" "}
              in sales today. {lowStockProducts.length > 0 ? `${lowStockProducts.length} items require stock attention.` : "Inventory is healthy."}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate("/pos")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#4A25E1] to-[#3612B8] hover:from-[#3c19cf] hover:to-[#2e0ea3] text-white font-bold text-xs tracking-tight shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Open POS (F2)</span>
            </button>
            <button
              onClick={() => navigate("/stock")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-border bg-surface hover:bg-surface-2 text-text-primary font-semibold text-xs tracking-tight shadow-xs hover:border-[#4A25E1]/30 transition-all cursor-pointer"
            >
              <Boxes className="h-4 w-4 text-[#4A25E1] dark:text-[#754BFB]" />
              <span>Restock</span>
            </button>
          </div>
        </div>

        {/* Decorative backdrop glow */}
        <div className="absolute right-0 top-0 -mt-12 -mr-12 h-64 w-64 rounded-full bg-[#4A25E1]/5 dark:bg-[#6236FF]/10 blur-3xl pointer-events-none" />
      </motion.div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              title: "Today's Revenue",
              value: stats?.todayRevenue ?? 0,
              icon: <TrendingUp className="h-5 w-5" />,
              href: "/invoices",
              subtitle: "View completed invoices",
            },
            {
              title: "Outstanding Arrears",
              value: stats?.totalArrears ?? 0,
              icon: <AlertCircle className="h-5 w-5" />,
              href: "/arrears",
              subtitle: "Collect balance dues",
            },
            {
              title: "Low Stock Items",
              value: stats?.lowStockCount ?? 0,
              icon: <Package className="h-5 w-5" />,
              href: "/stock",
              subtitle: "Urgent purchase orders",
            },
            {
              title: "Expiring Soon",
              value: stats?.expiringSoonCount ?? 0,
              icon: <Clock className="h-5 w-5" />,
              href: "/products",
              subtitle: "Check expiry dates",
            },
          ] as const
        ).map((item, i) => (
          <motion.div
            key={item.title}
            custom={i}
            variants={statVariants}
            initial="hidden"
            animate="visible"
          >
            <StatCard
              title={item.title}
              value={item.value}
              icon={item.icon}
              subtitle={item.subtitle}
              href={item.href}
              onClick={() => navigate(item.href)}
              delay={0}
            />
          </motion.div>
        ))}
      </div>

      {/* Quick Access Action Strip */}
      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {[
            {
              label: "New POS Sale",
              sub: "Shortcut: F2",
              icon: ShoppingCart,
              href: "/pos",
              color: "text-[#4A25E1] dark:text-[#754BFB] bg-[#4A25E1]/10 dark:bg-white/10",
            },
            {
              label: "Add Medicine",
              sub: "Shortcut: Ctrl+N",
              icon: Package,
              href: "/products",
              color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
            },
            {
              label: "New Customer",
              sub: "Ledgers & credit",
              icon: Users,
              href: "/customers",
              color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
            },
            {
              label: "Shop Expense",
              sub: "Daily bills & logs",
              icon: Wallet,
              href: "/expenses",
              color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
            },
          ].map((action) => (
            <motion.button
              key={action.label}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(action.href)}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-border/80 bg-surface shadow-xs hover:shadow-md hover:border-[#4A25E1]/30 transition-all duration-200 cursor-pointer text-left"
            >
              <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${action.color}`}>
                <action.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-text-primary truncate">{action.label}</p>
                <p className="text-[11px] text-text-secondary truncate mt-0.5">{action.sub}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Analytics Row: Revenue Chart & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-display font-bold">Revenue Analytics</CardTitle>
              <CardDescription>Daily prescription & retail turnover</CardDescription>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-2 border border-border/60">
              <button
                onClick={() => setChartPeriod("week")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  chartPeriod === "week"
                    ? "bg-surface text-[#4A25E1] dark:text-[#754BFB] shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setChartPeriod("month")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  chartPeriod === "month"
                    ? "bg-surface text-[#4A25E1] dark:text-[#754BFB] shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                30 Days
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <RevenueChart
              data={chartPeriod === "week" ? stats?.weekRevenue : stats?.monthRevenue}
              period={chartPeriod}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display font-bold">Top Products</CardTitle>
            <CardDescription>Highest revenue medicines</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={stats?.topProducts} />
          </CardContent>
        </Card>
      </div>

      {/* Inventory & Expiry Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Low Stock Warning</CardTitle>
                  <CardDescription className="text-[11px]">Medicines requiring reorder</CardDescription>
                </div>
              </div>
              <button
                onClick={() => navigate("/stock")}
                className="text-xs text-[#4A25E1] dark:text-[#754BFB] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Stock View</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <p className="text-xs text-text-secondary py-6 text-center">
                  All products are well stocked
                </p>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => navigate("/stock")}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-semibold text-text-primary truncate">{product.name}</p>
                        <p className="text-[10px] text-text-secondary font-mono">{product.barcode || "No barcode"}</p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          product.stock_qty <= 5
                            ? "bg-danger/10 text-danger"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {product.stock_qty} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Expiring Soon Alert */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Expiring Soon</CardTitle>
                  <CardDescription className="text-[11px]">Batches nearing expiration (30d)</CardDescription>
                </div>
              </div>
              <button
                onClick={() => navigate("/products")}
                className="text-xs text-[#4A25E1] dark:text-[#754BFB] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Catalog</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent>
              {expiringProducts.length === 0 ? (
                <p className="text-xs text-text-secondary py-6 text-center">
                  No products expiring within 30 days
                </p>
              ) : (
                <div className="space-y-2">
                  {expiringProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => navigate("/products")}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-semibold text-text-primary truncate">{product.name}</p>
                        <p className="text-[10px] text-text-secondary">
                          {product.stock_qty} units in stock
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                        {product.expiry ? new Date(product.expiry).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Customers & Outstanding Arrears */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Top Customers</CardTitle>
                  <CardDescription className="text-[11px]">Ranked by total purchases</CardDescription>
                </div>
              </div>
              <button
                onClick={() => navigate("/customers")}
                className="text-xs text-[#4A25E1] dark:text-[#754BFB] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent>
              {topCustomers.length === 0 ? (
                <p className="text-xs text-text-secondary py-6 text-center">No customer records yet</p>
              ) : (
                <div className="space-y-2">
                  {topCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-semibold text-text-primary truncate">{customer.name}</p>
                        <p className="text-[10px] text-text-secondary">{customer.phone || "No phone"}</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-text-primary bg-surface px-2.5 py-1 rounded-xl border border-border shadow-xs">
                        {formatCurrency(customer.total_spent)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Pending Arrears */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Pending Arrears</CardTitle>
                  <CardDescription className="text-[11px]">Highest customer debts</CardDescription>
                </div>
              </div>
              <button
                onClick={() => navigate("/arrears")}
                className="text-xs text-[#4A25E1] dark:text-[#754BFB] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Arrears</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent>
              {pendingArrears.length === 0 ? (
                <p className="text-xs text-text-secondary py-6 text-center">No pending arrears</p>
              ) : (
                <div className="space-y-2">
                  {pendingArrears.map((arrear) => (
                    <div
                      key={arrear.id}
                      onClick={() => navigate("/arrears")}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-semibold text-text-primary truncate">{arrear.customer_name}</p>
                        <p className="text-[10px] text-text-secondary">
                          Invoice #{arrear.sale_id?.slice(0, 8)}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-danger bg-danger/10 px-2.5 py-1 rounded-xl">
                        {formatCurrency(arrear.balance_due)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Sales Transactions Stream */}
      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#4A25E1]/10 dark:bg-white/10 flex items-center justify-center text-[#4A25E1] dark:text-[#754BFB]">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-display font-bold">Recent Transactions</CardTitle>
                <CardDescription>Latest POS sales stream</CardDescription>
              </div>
            </div>
            <button
              onClick={() => navigate("/invoices")}
              className="text-xs text-[#4A25E1] dark:text-[#754BFB] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>All Invoices</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </CardHeader>
          <CardContent className="pt-2">
            <RecentSalesTable />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
