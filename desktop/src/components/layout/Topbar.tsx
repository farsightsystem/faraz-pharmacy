import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Monitor, Sun, Moon, RefreshCw, Database, Wifi, Clock, Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useServerConnection } from "@/contexts/ServerConnectionContext";
import { useSidebar } from "@/contexts/SidebarContext";
import GlobalSearch from "@/components/shared/GlobalSearch";

const pageLabels: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Overview & Real-time Analytics" },
  "/pos": { title: "Point of Sale", subtitle: "Fast checkout & barcode billing" },
  "/products": { title: "Products Catalog", subtitle: "Manage medicine inventory & pricing" },
  "/barcodes": { title: "Barcode Labels", subtitle: "Thermal barcode printing & generator" },
  "/stock": { title: "Stock Purchases", subtitle: "Purchase invoices & distributor receiving" },
  "/customers": { title: "Customers", subtitle: "Customer records, ledgers & history" },
  "/invoices": { title: "Sales Invoices", subtitle: "Receipt history & invoice reprints" },
  "/arrears": { title: "Arrears & Credit", subtitle: "Outstanding customer debts & recoveries" },
  "/distributors": { title: "Distributors", subtitle: "Suppliers, companies & order history" },
  "/companies": { title: "Pharmaceutical Companies", subtitle: "Brand manufacturers & product lines" },
  "/categories": { title: "Product Categories", subtitle: "Manage & organize medicine categories" },
  "/returns": { title: "Sales Returns", subtitle: "Customer refund & product return entries" },
  "/expenses": { title: "Expenses", subtitle: "Daily shop expenses & ledger tracking" },
  "/reports": { title: "Analytics & Reports", subtitle: "Financial analytics, profit & tax reports" },
  "/settings": { title: "System Settings", subtitle: "Hardware, thermal printers & backups" },
};

export default function Topbar() {
  const location = useLocation();
  const [time, setTime] = useState("");
  const [dark, setDark] = useState(false);
  const [showConnectionDropdown, setShowConnectionDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
      timer = setTimeout(update, 60_000 - (Date.now() % 60_000));
    };
    update();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConnectionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("faraz_theme", next ? "dark" : "light");
    } catch {}
  }

  const { isOnline, isInitialCheck, connectionInfo, reconnect } = useServerConnection();
  const { collapsed, toggleSidebar } = useSidebar();
  const page = pageLabels[location.pathname] || {
    title: "Faraz Pharmacy",
    subtitle: "Management System",
  };
  const isServer = window.appConfig?.mode === "server";

  const formatLastChecked = (date: Date | null) => {
    if (!date) return "Never";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <header className="h-16 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-30 select-none">
      <div className="flex items-center justify-between h-full px-6 gap-4">
        {/* Page Title & Breadcrumb */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Sidebar Open/Close Toggle */}
          <button
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-9 w-9 rounded-xl border border-border/80 bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-brand/40 hover:bg-surface-2 transition-all shadow-xs cursor-pointer shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="min-w-0"
          >
            <h1 className="text-base font-display font-bold text-text-primary tracking-tight truncate">
              {page.title}
            </h1>
            <p className="text-[11px] text-text-secondary leading-none mt-0.5 truncate hidden sm:block">
              {page.subtitle}
            </p>
          </motion.div>

          {/* Global Search Pill */}
          <div className="hidden md:block">
            <GlobalSearch />
          </div>
        </div>

        {/* Right Action Widgets */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Connection Status Pill */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setShowConnectionDropdown(!showConnectionDropdown)}
              className="flex items-center gap-2 px-3 h-9 rounded-full border border-border bg-surface text-xs text-text-secondary font-medium hover:border-brand/40 hover:bg-surface-2 transition-all shadow-xs cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isInitialCheck ? "bg-muted-foreground/40" : isOnline ? "bg-success" : "bg-danger"
                  }`}
                />
              </span>
              {isServer ? (
                <Server className="h-3.5 w-3.5 text-[#4A25E1] dark:text-[#754BFB]" />
              ) : (
                <Monitor className="h-3.5 w-3.5 text-text-secondary" />
              )}
              <span className="hidden sm:inline font-medium text-text-primary">
                {isServer ? "Server" : "Client"}
              </span>
            </button>

            <AnimatePresence>
              {showConnectionDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden z-50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#4A25E1] dark:text-[#754BFB]" />
                      <p className="text-xs font-bold text-text-primary">System & Connection</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reconnect();
                      }}
                      title="Test Connection"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-brand hover:bg-surface-2 transition-all cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    {/* Server URL */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-surface-2">
                      <div className="flex items-center gap-2">
                        <Server className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="text-text-secondary text-[11px]">Server URL</span>
                      </div>
                      <span className="font-mono font-semibold text-text-primary truncate max-w-[140px]">
                        {connectionInfo.serverUrl.replace(/^https?:\/\//, "")}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-surface-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="text-text-secondary text-[11px]">Network</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span
                          className={`h-2 w-2 rounded-full ${connectionInfo.isOnline ? "bg-success" : "bg-danger"}`}
                        />
                        <span className={connectionInfo.isOnline ? "text-success" : "text-danger"}>
                          {connectionInfo.isOnline ? "Online" : "Disconnected"}
                        </span>
                      </div>
                    </div>

                    {/* Latency */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-surface-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="text-text-secondary text-[11px]">Latency</span>
                      </div>
                      <span className="font-mono font-medium text-text-primary">
                        {connectionInfo.responseTime !== null
                          ? `${connectionInfo.responseTime} ms`
                          : "—"}
                      </span>
                    </div>

                    {/* Database */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-surface-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="text-text-secondary text-[11px]">Database</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span
                          className={`h-2 w-2 rounded-full ${connectionInfo.databaseOnline ? "bg-success" : "bg-danger"}`}
                        />
                        <span className={connectionInfo.databaseOnline ? "text-success" : "text-danger"}>
                          {connectionInfo.databaseOnline ? "Active" : "Down"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-[10px] text-text-secondary">
                    <span>Last checked</span>
                    <span className="font-medium text-text-primary">
                      {formatLastChecked(connectionInfo.lastChecked)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Digital Clock Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full border border-border bg-surface shadow-xs text-xs text-text-secondary font-mono font-medium">
            <Clock className="h-3.5 w-3.5 text-text-secondary/70" />
            <span>{time}</span>
          </div>

          {/* Dark / Light Toggle */}
          <button
            onClick={toggleDark}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="h-9 w-9 rounded-full border border-border bg-surface shadow-xs flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-all cursor-pointer"
          >
            {dark ? <Sun className="h-4 w-4 text-warning" /> : <Moon className="h-4 w-4 text-[#4A25E1]" />}
          </button>
        </div>
      </div>
    </header>
  );
}
