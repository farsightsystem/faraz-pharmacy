import { Suspense, lazy, useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster, toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ServerConnectionProvider } from "@/contexts/ServerConnectionContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import PrintPreviewDialog from "@/components/shared/PrintPreviewDialog";
import { getLastReceipt } from "@/lib/receiptStore";
import type { PrinterConfig } from "@/types";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import OfflineBanner from "@/components/shared/OfflineBanner";
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const POS = lazy(() => import("@/pages/POS"));
const Products = lazy(() => import("@/pages/Products"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const Arrears = lazy(() => import("@/pages/Arrears"));
const Stock = lazy(() => import("@/pages/Stock"));
const Distributors = lazy(() => import("@/pages/Distributors"));
const Returns = lazy(() => import("@/pages/Returns"));
const Categories = lazy(() => import("@/pages/Categories"));
const Barcodes = lazy(() => import("@/pages/Barcodes"));
const Companies = lazy(() => import("@/pages/Companies"));
const CompanyDetail = lazy(() => import("@/pages/CompanyDetail"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Reports = lazy(() => import("@/pages/Reports"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const Settings = lazy(() => import("@/pages/Settings"));

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } },
} as const;

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </motion.div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-secondary">
      Loading page...
    </div>
  );
}

function AppShell() {
  const { isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(location.search);
  const isPosWindow = searchParams.has("pos");
  const isStandaloneWindow =
    isPosWindow || searchParams.has("standalone") || location.pathname === "/returns/terminal";

  const [reprintOpen, setReprintOpen] = useState(false);
  const [reprintData, setReprintData] = useState<unknown>(null);

  useEffect(() => {
    const request = indexedDB.deleteDatabase("PharmacyDB");
    request.onerror = () =>
      console.error("Could not clear the obsolete local product database:", request.error);
    request.onblocked = () =>
      console.error(
        "Could not clear the obsolete local product database because another window is using it."
      );
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !window.electronAPI?.socket) return;
    return window.electronAPI.socket.onInventoryUpdated(() => {
      void queryClient.resetQueries({ queryKey: ["products"] });
      void queryClient.resetQueries({ queryKey: ["products-search"] });
      void queryClient.resetQueries({ queryKey: ["global-search-products"] });
      void queryClient.resetQueries({ queryKey: ["global-search-catalog-sample"] });
      void queryClient.resetQueries({ queryKey: ["stock"] });
      void queryClient.resetQueries({ queryKey: ["recent-stock-purchases"] });
    });
  }, [isAuthenticated, queryClient]);

  const generateReprintHtml = useCallback(
    async (paperSize: string): Promise<string> => {
      if (!reprintData) return "";
      const result = await window.generateReceiptHTML(reprintData, paperSize);
      return result.success ? result.html : "";
    },
    [reprintData]
  );

  async function handleReprint(config: PrinterConfig) {
    if (!reprintData) return;
    const result = await window.printReceipt(reprintData, config);
    if (!result.success) {
      throw new Error(result.error || "Print failed");
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // F-keys (only when not typing)
      if (!typing && !e.altKey && !e.ctrlKey && !e.metaKey) {
        switch (e.key) {
          case "F1":
            e.preventDefault();
            navigate("/dashboard");
            break;
          case "F2":
            e.preventDefault();
            navigate("/pos");
            break;
          case "F3":
            e.preventDefault();
            navigate("/invoices");
            break;
          case "F4":
            e.preventDefault();
            navigate("/returns");
            break;
          case "F5":
            e.preventDefault();
            navigate("/customers");
            break;
          case "F6":
            e.preventDefault();
            navigate("/arrears");
            break;
          case "F7":
            e.preventDefault();
            navigate("/products");
            break;
          case "F8":
            e.preventDefault();
            navigate("/stock");
            break;
          case "F9":
            e.preventDefault();
            navigate("/barcodes");
            break;
          case "F10":
            e.preventDefault();
            navigate("/distributors");
            break;
          case "F11":
            e.preventDefault();
            navigate("/expenses");
            break;
          case "F12":
            e.preventDefault();
            navigate("/reports");
            break;
          case "F13":
            e.preventDefault();
            navigate("/settings");
            break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAuthenticated, navigate, logout]);

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoading />}>
        <Login />
      </Suspense>
    );
  }

  const routes = (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route
          path="/dashboard"
          element={
            <AnimatedPage>
              <Dashboard />
            </AnimatedPage>
          }
        />
        <Route
          path="/pos"
          element={
            <AnimatedPage>
              <POS />
            </AnimatedPage>
          }
        />
        <Route
          path="/products"
          element={
            <AnimatedPage>
              <Products />
            </AnimatedPage>
          }
        />
        <Route
          path="/customers"
          element={
            <AnimatedPage>
              <Customers />
            </AnimatedPage>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <AnimatedPage>
              <CustomerDetail />
            </AnimatedPage>
          }
        />
        <Route
          path="/arrears"
          element={
            <AnimatedPage>
              <Arrears />
            </AnimatedPage>
          }
        />
        <Route
          path="/stock"
          element={
            <AnimatedPage>
              <Stock />
            </AnimatedPage>
          }
        />
        <Route
          path="/distributors"
          element={
            <AnimatedPage>
              <Distributors />
            </AnimatedPage>
          }
        />
        <Route
          path="/barcodes"
          element={
            <AnimatedPage>
              <Barcodes />
            </AnimatedPage>
          }
        />
        <Route
          path="/companies"
          element={
            <AnimatedPage>
              <Companies />
            </AnimatedPage>
          }
        />
        <Route
          path="/categories"
          element={
            <AnimatedPage>
              <Categories />
            </AnimatedPage>
          }
        />
        <Route
          path="/companies/:id"
          element={
            <AnimatedPage>
              <CompanyDetail />
            </AnimatedPage>
          }
        />
        <Route
          path="/returns"
          element={
            <AnimatedPage>
              <Returns />
            </AnimatedPage>
          }
        />
        <Route
          path="/returns/terminal"
          element={
            <AnimatedPage>
              <Returns defaultMode="terminal" isStandaloneWindow={isStandaloneWindow} />
            </AnimatedPage>
          }
        />
        <Route
          path="/expenses"
          element={
            <AnimatedPage>
              <Expenses />
            </AnimatedPage>
          }
        />
        <Route
          path="/reports"
          element={
            <AnimatedPage>
              <Reports />
            </AnimatedPage>
          }
        />
        <Route
          path="/invoices"
          element={
            <AnimatedPage>
              <Invoices />
            </AnimatedPage>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <AnimatedPage>
              <InvoiceDetail />
            </AnimatedPage>
          }
        />
        <Route
          path="/settings"
          element={
            <AnimatedPage>
              <Settings />
            </AnimatedPage>
          }
        />
      </Routes>
    </AnimatePresence>
  );

  if (isStandaloneWindow) {
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <OfflineBanner />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{routes}</main>
        </div>
        <PrintPreviewDialog
          open={reprintOpen}
          onOpenChange={(v) => {
            setReprintOpen(v);
            if (!v) setReprintData(null);
          }}
          title="Receipt Preview"
          htmlGenerator={generateReprintHtml}
          onPrint={handleReprint}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto p-5 lg:p-6">{routes}</main>
      </div>
      <PrintPreviewDialog
        open={reprintOpen}
        onOpenChange={(v) => {
          setReprintOpen(v);
          if (!v) setReprintData(null);
        }}
        title="Receipt Preview"
        htmlGenerator={generateReprintHtml}
        onPrint={handleReprint}
      />
    </div>
  );
}

export default function App() {
  return (
    <ServerConnectionProvider>
      <AuthProvider>
        <SidebarProvider>
          <AppShell />
          <Toaster richColors position="top-right" closeButton />
        </SidebarProvider>
      </AuthProvider>
    </ServerConnectionProvider>
  );
}
