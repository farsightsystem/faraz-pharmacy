import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  Search,
  Barcode,
  AlertCircle,
  ShoppingCart,
  Trash2,
  Eye,
  EyeOff,
  CornerDownLeft,
  Keyboard,
} from "lucide-react";
import CartTable from "@/components/pos/CartTable";
import CustomerSelector from "@/components/pos/CustomerSelector";
import ProductSearchDropdown from "@/components/pos/ProductSearchDropdown";
import PrintPreviewDialog from "@/components/shared/PrintPreviewDialog";
import { useMultiSale } from "@/hooks/useMultiSale";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { setLastReceipt } from "@/lib/receiptStore";
import { toast } from "sonner";
import type { Product, PrinterConfig, ProductPrice, Customer } from "@/types";

export default function POS() {
  const location = useLocation();
  const isPosWindow = new URLSearchParams(location.search).has("pos");
  const queryClient = useQueryClient();
  const cart = useMultiSale();

  // Search & Barcode scanning states
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 100);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerTriggerRef = useRef<HTMLButtonElement>(null);
  const amountPaidInputRef = useRef<HTMLInputElement>(null);
  const searchErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Price tier modal
  const [pricePickerOpen, setPricePickerOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

  // Arrears confirmation modal
  const [arrearsConfirmOpen, setArrearsConfirmOpen] = useState(false);
  const pendingPrices = pendingProduct
    ? ((pendingProduct as any).prices as ProductPrice[] | undefined)
    : undefined;

  // Print states
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<Record<string, unknown> | null>(null);
  const [pendingPrintData, setPendingPrintData] = useState<Record<string, unknown> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showProfit, setShowProfit] = useState(false);

  // Track arrears options
  const [isCustomAmountPaid, setIsCustomAmountPaid] = useState(false);
  const [isFullArrears, setIsFullArrears] = useState(false);

  // Focus Search helper (single most important UX rule)
  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  // Autofocus Search on page load
  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  // Show inline error near search input
  const showInlineError = useCallback((msg: string) => {
    if (searchErrorTimerRef.current) clearTimeout(searchErrorTimerRef.current);
    setSearchError(msg);
    searchErrorTimerRef.current = setTimeout(() => {
      setSearchError("");
    }, 3500);
  }, []);

  // Fetch customers for selector & arrears
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: api.customers.list,
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === cart.customerId),
    [customers, cart.customerId]
  );
  const customerPreviousArrears = Number(selectedCustomer?.outstanding_arrear || 0);

  // Typed search query for products (starts on the very first character)
  const { data: searchResults } = useQuery({
    queryKey: ["products-search", debouncedSearch],
    queryFn: () => api.products.listPaginated({ search: debouncedSearch.trim(), limit: 12 }),
    enabled: debouncedSearch.trim().length >= 1,
  });

  const matchingProducts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return [];
    const list = searchResults?.data ?? [];

    // Case-insensitive sorting: exact matches or prefixes come first
    return [...list].sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aBarcode = (a.barcode || "").toLowerCase();
      const bBarcode = (b.barcode || "").toLowerCase();

      const aExact = aName === query || aBarcode === query;
      const bExact = bName === query || bBarcode === query;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aStarts = aName.startsWith(query) || aBarcode.startsWith(query);
      const bStarts = bName.startsWith(query) || bBarcode.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return aName.localeCompare(bName);
    });
  }, [debouncedSearch, searchResults?.data]);

  // Handle dropdown visibility based on query (appears automatically on the first letter)
  useEffect(() => {
    if (matchingProducts.length > 0 && search.trim().length >= 1) {
      setDropdownOpen(true);
      setHighlightedIndex(0);
    } else {
      setDropdownOpen(false);
    }
  }, [matchingProducts, search]);

  // Amount Paid behavior:
  // - Defaults to Total (customer selection is optional for full payments)
  // - Capped at cart.total (cannot exceed total amount)
  // - Keeps synced with Total unless cashier entered custom partial amount or 100% credit
  useEffect(() => {
    if (isFullArrears) {
      cart.setAmountPaid("0");
    } else if (!isCustomAmountPaid) {
      cart.setAmountPaid(cart.total > 0 ? String(cart.total) : "0");
    } else {
      const currentVal = Number(cart.amountPaid) || 0;
      if (currentVal > cart.total) {
        cart.setAmountPaid(String(cart.total));
      }
    }
  }, [cart.total, isCustomAmountPaid, isFullArrears]);

  const numAmountPaid = isFullArrears
    ? 0
    : Math.min(cart.total, Math.max(0, Number(cart.amountPaid) || 0));
  const arrearsShortfall =
    numAmountPaid < cart.total ? cart.total - numAmountPaid : 0;
  const isPartialOrCredit = isFullArrears || arrearsShortfall > 0;
  const changeDue = 0;

  // Add product to cart helper
  const addProductToCart = useCallback(
    (product: Product, salePrice: number, purchasePrice?: number) => {
      if (product.stock_qty <= 0) {
        showInlineError("Out of stock");
        return;
      }

      // Check if existing item in cart already reached stock ceiling
      const existing = cart.items.find((i) => i.productId === product.id);
      if (existing && existing.quantity + 1 > existing.stockQty) {
        showInlineError(`Cannot add more. Max stock reached (${existing.stockQty})`);
        return;
      }

      cart.addItem({
        ...product,
        sale_price: salePrice,
        purchase_price: purchasePrice ?? product.purchase_price,
      });

      setSearch("");
      setDropdownOpen(false);
      setSearchError("");
      focusSearch();
    },
    [cart, focusSearch, showInlineError]
  );

  const promptPriceTier = useCallback(
    (product: Product) => {
      const tiers = (product as any).prices as ProductPrice[] | undefined;
      if (tiers && tiers.length > 0) {
        setPendingProduct(product);
        setPricePickerOpen(true);
      } else {
        addProductToCart(product, product.sale_price);
      }
    },
    [addProductToCart]
  );

  const handleTierSelect = useCallback(
    (tierSalePrice: number, tierPurchasePrice?: number) => {
      if (!pendingProduct) return;
      addProductToCart(pendingProduct, tierSalePrice, tierPurchasePrice);
      setPendingProduct(null);
      setPricePickerOpen(false);
      focusSearch();
    },
    [pendingProduct, addProductToCart, focusSearch]
  );

  // Barcode Scan (Enter key) vs. Typed Search Enter
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const trimmed = search.trim();

    if (e.key === "ArrowDown") {
      if (dropdownOpen && matchingProducts.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, matchingProducts.length - 1));
      }
      return;
    }

    if (e.key === "ArrowUp") {
      if (dropdownOpen && matchingProducts.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      }
      return;
    }

    if (e.key === "Escape") {
      if (dropdownOpen) {
        e.preventDefault();
        setDropdownOpen(false);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (!trimmed) return;

      // 1. Check if exact barcode match (case-insensitive)
      const lower = trimmed.toLowerCase();
      const localBarcodeMatch = matchingProducts.find(
        (p) => (p.barcode || "").toLowerCase() === lower
      );
      if (localBarcodeMatch) {
        if (localBarcodeMatch.stock_qty <= 0) {
          showInlineError("Out of stock");
          setSearch("");
          focusSearch();
          return;
        }
        promptPriceTier(localBarcodeMatch);
        return;
      }

      try {
        const barcodeProduct = await api.products.getByBarcode(trimmed);
        if (barcodeProduct) {
          if (barcodeProduct.stock_qty <= 0) {
            showInlineError("Out of stock");
            setSearch("");
            focusSearch();
            return;
          }
          promptPriceTier(barcodeProduct);
          return;
        }
      } catch {
        // Not a barcode match, fall through to search results
      }

      // 2. If dropdown is open and user navigates or selects
      if (dropdownOpen && matchingProducts.length > 0) {
        const selected = matchingProducts[highlightedIndex] || matchingProducts[0];
        if (selected) {
          if (selected.stock_qty <= 0) {
            showInlineError("Out of stock");
            setSearch("");
            focusSearch();
            return;
          }
          promptPriceTier(selected);
          return;
        }
      }

      // 3. Exact single match or fallback
      if (matchingProducts.length === 1) {
        const single = matchingProducts[0];
        if (single.stock_qty <= 0) {
          showInlineError("Out of stock");
        } else {
          promptPriceTier(single);
        }
        setSearch("");
        focusSearch();
        return;
      }

      showInlineError("Product not found");
      focusSearch();
    }
  };

  // Core Sale Execution
  const executeSale = async () => {
    setProcessing(true);
    try {
      const sale = await api.sales.create({
        customerId: cart.customerId || undefined,
        customerName: cart.customerName || "Walk-in Customer",
        items: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiry: item.expiry,
        })),
        subtotal: cart.subtotal,
        discount: cart.discount,
        tax: cart.tax,
        total: cart.total,
        amountPaid: numAmountPaid,
      });

      // Query cache invalidations
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["arrears-by-customer"] });
      queryClient.invalidateQueries({ queryKey: ["arrears"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });

      let customerTotalArrears = 0;
      if (cart.customerId) {
        const customer = await api.customers.getById(cart.customerId);
        customerTotalArrears = customer?.outstanding_arrear ?? 0;
      }

      const printData = {
        ...sale,
        tax: cart.tax,
        customer_name: cart.customerName || sale.customer_name || "Walk-in Customer",
        customer_total_arrears: customerTotalArrears,
        items:
          sale.items && sale.items.length > 0
            ? sale.items.map((item: any) => ({
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.subtotal,
              }))
            : cart.items.map((item) => ({
                product_name: item.productName,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                subtotal: item.subtotal,
              })),
      };

      setLastSaleData(printData);
      setLastReceipt(printData);

      const cfg = window.appConfig?.printer as any;
      if (cfg?.autoPrint) {
        window.printReceipt(printData, cfg).catch(() => {});
      } else {
        setPendingPrintData(printData);
        setShowPrintDialog(true);
      }

      cart.clearCart();
      setIsCustomAmountPaid(false);
      setIsFullArrears(false);
      toast.success("Sale completed successfully");
      focusSearch();
    } catch (err: any) {
      toast.error(err.message || "Checkout failed");
    } finally {
      setProcessing(false);
    }
  };

  // Checkout execution / confirmation validation
  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      focusSearch();
      return;
    }

    // If there is any remaining amount going into arrears:
    if (arrearsShortfall > 0) {
      if (!cart.customerId) {
        toast.error("Please select a customer to add remaining balance to arrears");
        customerTriggerRef.current?.focus();
        return;
      }

      // Customer is selected and amount is going to arrears -> Require Confirmation Modal
      setArrearsConfirmOpen(true);
      return;
    }

    // Full payment sale: complete immediately
    await executeSale();
  };

  // Keyboard Shortcuts (Ctrl+Enter to Pay, Ctrl+P to reprint)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Reprint: Ctrl+P or Alt+T
      if ((e.ctrlKey && e.key.toLowerCase() === "p") || (e.altKey && e.key.toLowerCase() === "t")) {
        e.preventDefault();
        if (lastSaleData) {
          setPendingPrintData(lastSaleData);
          setShowPrintDialog(true);
        } else {
          toast.error("No recent sale to reprint");
        }
        return;
      }

      // Quick Pay: Ctrl+Enter or Ctrl+S
      if ((e.ctrlKey && e.key === "Enter") || (e.ctrlKey && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        if (cart.items.length > 0) {
          handleCheckout();
        }
        return;
      }

      // Focus Discount: Ctrl+D
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        document.getElementById("pos-discount")?.focus();
        return;
      }

      // Focus Tax: Ctrl+T (without alt)
      if (e.ctrlKey && e.key.toLowerCase() === "t" && !e.altKey) {
        e.preventDefault();
        document.getElementById("pos-tax")?.focus();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const generateHtml = useCallback(
    async (paperSize: string): Promise<string> => {
      if (!pendingPrintData) return "";
      const result = await window.generateReceiptHTML(pendingPrintData, paperSize);
      return result.success ? result.html : "";
    },
    [pendingPrintData]
  );

  const handlePrint = async (config: PrinterConfig) => {
    if (!pendingPrintData) return;
    const result = await window.printReceipt(pendingPrintData, config);
    if (!result.success) {
      throw new Error(result.error || "Print failed");
    }
  };

  const canPay =
    cart.items.length > 0 &&
    !processing &&
    (!isPartialOrCredit || !!cart.customerId);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-[1600px] mx-auto px-4 py-2 select-none gap-3">
      {/* Multi-window drag handle */}

      {/* TOP: Full-width Search & Barcode Bar */}
      <div className="shrink-0 space-y-1.5">
        <div className="relative">
          <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary/70 pointer-events-none" />
          <Input
            id="pos-search-input"
            ref={searchInputRef}
            tabIndex={1}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Scan barcode or search medicine name..."
            className="h-12 pl-12 pr-12 text-sm font-medium rounded-2xl border-2 border-border/80 focus-visible:border-accent bg-surface shadow-xs tracking-wide"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-secondary/60 bg-surface-2 border border-border/60 rounded">
              <CornerDownLeft className="h-3 w-3" />
            </kbd>
            <Search className="h-4 w-4 text-text-secondary/50" />
          </div>

          {/* Typed Search Autocomplete Dropdown */}
          <ProductSearchDropdown
            isOpen={dropdownOpen}
            products={matchingProducts}
            highlightedIndex={highlightedIndex}
            onSelect={(product) => {
              if (product.stock_qty <= 0) {
                showInlineError("Out of stock");
              } else {
                promptPriceTier(product);
              }
              setSearch("");
              focusSearch();
            }}
            onClose={() => setDropdownOpen(false)}
            triggerRef={searchInputRef}
          />
        </div>

        {/* Inline error indicator near search bar */}
        {searchError && (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-semibold animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* MAIN TWO-COLUMN SPLIT COCKPIT */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: 65% Cart Ledger Table */}
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5 text-accent" />
                Scanned Items
              </span>
              {cart.items.length > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-full bg-accent/10 text-accent">
                  {cart.items.reduce((acc, i) => acc + i.quantity, 0)} units ({cart.items.length}{" "}
                  items)
                </span>
              )}
            </div>

            {cart.items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={cart.clearCart}
                className="h-7 px-2 text-xs text-text-secondary hover:text-danger hover:bg-danger/10 gap-1 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear Cart</span>
              </Button>
            )}
          </div>

          {/* Cart Table or Empty State */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {cart.items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border/70 rounded-3xl p-8 text-center text-text-secondary bg-surface/30">
                <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
                  <ShoppingCart className="h-7 w-7 text-text-secondary/50" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Cart is empty</p>
                <p className="text-xs text-text-secondary/80 mt-1 max-w-sm">
                  Scan a medicine barcode or start typing its name in the search bar above to ring
                  up a sale.
                </p>

                {/* Keyboard hints pill */}
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/40 text-[11px] text-text-secondary/60">
                  <span className="flex items-center gap-1">
                    <Keyboard className="h-3.5 w-3.5" />
                    <strong>Tab:</strong> Navigate fields
                  </span>
                  <span>•</span>
                  <span>
                    <strong>+ / -:</strong> Adjust quantity
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Delete:</strong> Remove row
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Ctrl + Enter:</strong> Pay
                  </span>
                </div>
              </div>
            ) : (
              <CartTable
                items={cart.items}
                onUpdateQuantity={cart.updateQuantity}
                onRemoveItem={cart.removeItem}
              />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 35% Sticky Transaction & Payment Panel */}
        <div className="w-full lg:w-[380px] xl:w-[410px] shrink-0 flex flex-col h-full min-h-0">
          <div className="flex-1 overflow-y-auto bg-surface border border-border/80 rounded-3xl p-4.5 flex flex-col gap-3.5 shadow-xs">
            {/* 1. Customer Section */}
            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Customer & Account
              </Label>
              <CustomerSelector
                customerId={cart.customerId}
                customerName={cart.customerName}
                onCustomerChange={cart.setCustomer}
                customers={customers}
                outstandingArrears={customerPreviousArrears}
                onModalCloseFocusSearch={focusSearch}
                triggerRef={customerTriggerRef}
              />
            </div>

            <Separator />

            {/* 2. Discount & Tax Row */}
            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Discount & Tax
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {/* Discount */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      tabIndex={4}
                      onClick={cart.toggleDiscountType}
                      className="h-8 px-2 rounded-xl text-xs font-bold border border-border/80 bg-surface-2 hover:bg-surface-2/80 text-text-primary transition-colors shrink-0 cursor-pointer"
                      title="Toggle PKR / %"
                    >
                      {cart.discountType === "pkr" ? "PKR" : "%"}
                    </button>
                    <Input
                      id="pos-discount"
                      tabIndex={4}
                      type="number"
                      placeholder={`Discount (${cart.discountType === "pkr" ? "PKR" : "%"})`}
                      value={cart.discountValue || ""}
                      onChange={(e) => cart.setDiscountValue(Number(e.target.value) || 0)}
                      className="h-8 rounded-xl text-xs font-mono font-medium"
                    />
                  </div>
                  {cart.discountValue > 0 && (
                    <p className="text-[10px] text-text-secondary text-right font-mono">
                      {cart.discountType === "percent"
                        ? `= -${formatCurrency(cart.discount)}`
                        : `= -${cart.subtotal > 0 ? Math.round((cart.discountValue * 100) / cart.subtotal) : 0}%`}
                    </p>
                  )}
                </div>

                {/* Tax */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      tabIndex={5}
                      onClick={cart.toggleTaxType}
                      className="h-8 px-2 rounded-xl text-xs font-bold border border-border/80 bg-surface-2 hover:bg-surface-2/80 text-text-primary transition-colors shrink-0 cursor-pointer"
                      title="Toggle PKR / %"
                    >
                      {cart.taxType === "pkr" ? "PKR" : "%"}
                    </button>
                    <Input
                      id="pos-tax"
                      tabIndex={5}
                      type="number"
                      placeholder={`Tax (${cart.taxType === "pkr" ? "PKR" : "%"})`}
                      value={cart.taxValue || ""}
                      onChange={(e) => cart.setTaxValue(Number(e.target.value) || 0)}
                      className="h-8 rounded-xl text-xs font-mono font-medium"
                    />
                  </div>
                  {cart.taxValue > 0 && (
                    <p className="text-[10px] text-text-secondary text-right font-mono">
                      {cart.taxType === "percent"
                        ? `= +${formatCurrency(cart.tax)}`
                        : `= +${Math.max(0, cart.subtotal - cart.discount) > 0 ? Math.round((cart.taxValue * 100) / Math.max(0, cart.subtotal - cart.discount)) : 0}%`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* 3. Totals Breakdown */}
            <div className="space-y-2 shrink-0">
              <div className="flex justify-between items-center text-xs text-text-secondary">
                <span>Subtotal</span>
                <span className="font-mono font-medium tabular-nums">
                  {formatCurrency(cart.subtotal)}
                </span>
              </div>

              {cart.discount > 0 && (
                <div className="flex justify-between items-center text-xs text-success">
                  <span>Discount</span>
                  <span className="font-mono font-medium tabular-nums">
                    -{formatCurrency(cart.discount)}
                  </span>
                </div>
              )}

              {cart.tax > 0 && (
                <div className="flex justify-between items-center text-xs text-amber-600 dark:text-amber-400">
                  <span>Tax</span>
                  <span className="font-mono font-medium tabular-nums">
                    +{formatCurrency(cart.tax)}
                  </span>
                </div>
              )}

              <Separator className="my-1" />

              <div className="flex justify-between items-baseline pt-0.5">
                <span className="text-sm font-bold text-text-primary">Total Due</span>
                <span className="font-mono text-2xl font-bold text-brand tabular-nums">
                  {formatCurrency(cart.total)}
                </span>
              </div>

              {/* Profit reveal toggle */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowProfit((v) => !v)}
                className="flex items-center justify-between w-full pt-1 text-[10px] text-text-secondary/60 hover:text-text-primary transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1 font-medium uppercase tracking-wider">
                  {showProfit ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  Profit
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums transition-all ${showProfit ? (cart.profit >= 0 ? "text-success" : "text-danger") : "blur-[4px] select-none text-text-secondary/30"}`}
                >
                  {showProfit ? formatCurrency(cart.profit) : "••••••"}
                </span>
              </button>
            </div>

            <Separator />

            {/* 4. Amount Paid & Arrears Options */}
            <div className="space-y-2.5 shrink-0">
              <Label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Payment & Arrears
              </Label>

              <Input
                id="pos-amount-paid"
                ref={amountPaidInputRef}
                tabIndex={6}
                type="number"
                disabled={isFullArrears}
                placeholder={
                  isFullArrears
                    ? "100% Credit (Rs 0 Paid)"
                    : "Amount Paid"
                }
                value={isFullArrears ? "" : cart.amountPaid}
                min="0"
                max={cart.total}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setIsCustomAmountPaid(true);
                    cart.setAmountPaid("");
                    return;
                  }
                  const num = Number(raw);
                  if (!isNaN(num) && num > cart.total) {
                    setIsCustomAmountPaid(true);
                    cart.setAmountPaid(String(cart.total));
                    toast.info(`Amount paid cannot exceed total (${formatCurrency(cart.total)})`);
                    return;
                  }
                  setIsCustomAmountPaid(true);
                  cart.setAmountPaid(raw);
                  if (num < cart.total && !cart.customerId) {
                    toast.info("Please select a customer to record remaining balance to arrears");
                  }
                }}
                className={`h-11 text-base font-mono font-bold text-center rounded-2xl border-2 transition-all ${
                  isFullArrears
                    ? "bg-surface-2/70 text-text-secondary border-dashed border-border/80 cursor-not-allowed"
                    : "border-border/90 focus-visible:border-brand bg-surface shadow-xs"
                }`}
              />

              {/* Helper text when customer is needed for arrears */}
              {!cart.customerId && arrearsShortfall > 0 && (
                <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 font-medium">
                  Select a customer above to record remaining {formatCurrency(arrearsShortfall)} to arrears
                </p>
              )}

              {/* Checkbox option: 100% Credit / Add all amount to arrears */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-2/60 border border-border/70">
                  <Checkbox
                    id="pos-full-arrears"
                    checked={isFullArrears}
                    onCheckedChange={(checked) => {
                      const val = checked === true;
                      if (val && !cart.customerId) {
                        toast.error("Please select a customer first to add amount to arrears");
                        customerTriggerRef.current?.focus();
                        return;
                      }
                      setIsFullArrears(val);
                      if (val) {
                        cart.setAmountPaid("0");
                        cart.setAddToArrears(true);
                      } else {
                        cart.setAmountPaid(String(cart.total));
                        setIsCustomAmountPaid(false);
                        cart.setAddToArrears(false);
                      }
                    }}
                  />
                  <Label
                    htmlFor="pos-full-arrears"
                    className="text-xs font-semibold text-text-primary cursor-pointer flex-1"
                  >
                    100% Credit (Add all {formatCurrency(cart.total)} to arrears)
                  </Label>
                </div>

                {/* Arrears difference callout for partial payments */}
                {!isFullArrears && arrearsShortfall > 0 && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-between">
                    <span>Remaining to arrears:</span>
                    <span className="font-mono text-sm font-bold">
                      {formatCurrency(arrearsShortfall)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Pay Button */}
            <div className="pt-2 shrink-0">
              <Button
                id="pos-pay-button"
                tabIndex={7}
                variant="brand"
                disabled={!canPay}
                onClick={handleCheckout}
                className="w-full h-12 text-sm font-bold rounded-2xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>
                  {processing
                    ? "Processing Sale..."
                    : isFullArrears
                      ? `Record to Arrears: ${formatCurrency(cart.total)}`
                      : arrearsShortfall > 0
                        ? !cart.customerId
                          ? "Select Customer for Arrears"
                          : `Pay ${formatCurrency(numAmountPaid)} + Arrears ${formatCurrency(arrearsShortfall)}`
                        : `Pay ${formatCurrency(cart.total)}`}
                </span>
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-medium bg-white/20 text-white rounded">
                  Ctrl + Enter
                </kbd>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Arrears Confirmation Dialog */}
      <Dialog open={arrearsConfirmOpen} onOpenChange={setArrearsConfirmOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-warning mb-1">
              <AlertCircle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-text-primary">
                Confirm Arrears Addition
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-text-secondary">
              The remaining balance from this transaction will be recorded to the customer's arrears / khata account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            {/* Customer Details */}
            <div className="p-3 rounded-xl bg-surface-2 border border-border/80 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">Customer:</span>
                <span className="font-bold text-text-primary">
                  {selectedCustomer?.name || cart.customerName || "Selected Customer"}
                </span>
              </div>
              {selectedCustomer?.phone && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary font-medium">Phone:</span>
                  <span className="font-mono text-text-primary">{selectedCustomer.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs pt-1.5 border-t border-border/60">
                <span className="text-text-secondary font-medium">Current Arrears:</span>
                <span className="font-mono font-semibold text-text-primary">
                  {formatCurrency(customerPreviousArrears)}
                </span>
              </div>
            </div>

            {/* Arrears Summary Card */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">Total Bill:</span>
                <span className="font-mono font-bold text-text-primary">
                  {formatCurrency(cart.total)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">Amount Paid Now:</span>
                <span className="font-mono font-semibold text-success">
                  {formatCurrency(numAmountPaid)}
                </span>
              </div>
              <Separator className="bg-amber-500/20 my-1" />
              <div className="flex justify-between items-center text-sm font-bold text-amber-600 dark:text-amber-400">
                <span>Adding to Arrears:</span>
                <span className="font-mono text-base tabular-nums">
                  +{formatCurrency(arrearsShortfall)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1 text-text-secondary">
                <span>New Total Outstanding:</span>
                <span className="font-mono font-bold text-danger">
                  {formatCurrency(customerPreviousArrears + arrearsShortfall)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setArrearsConfirmOpen(false);
                toast.info("Sale was not processed");
              }}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={processing}
              onClick={async () => {
                setArrearsConfirmOpen(false);
                await executeSale();
              }}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {processing ? "Processing..." : "Confirm & Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Tier Selection Dialog (Preserved existing feature) */}
      <AlertDialog
        open={pricePickerOpen}
        onOpenChange={(v) => {
          if (!v) {
            setPendingProduct(null);
            setPricePickerOpen(false);
            focusSearch();
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold">Select Price Tier</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {pendingProduct?.name ?? "Product"} has multiple prices configured. Choose a tier:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <button
              type="button"
              onClick={() => pendingProduct && handleTierSelect(pendingProduct.sale_price ?? 0)}
              className="w-full p-2.5 rounded-xl border border-border hover:border-brand bg-surface flex items-center justify-between text-left text-xs transition-colors cursor-pointer"
            >
              <span className="font-semibold text-text-primary">Standard</span>
              <span className="font-mono font-bold text-brand">
                {formatCurrency(pendingProduct?.sale_price ?? 0)}
              </span>
            </button>
            {pendingPrices?.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => handleTierSelect(tier.salePrice, tier.purchasePrice)}
                className="w-full p-2.5 rounded-xl border border-border hover:border-brand bg-surface flex items-center justify-between text-left text-xs transition-colors cursor-pointer"
              >
                <span className="font-semibold text-text-primary">
                  {tier.label || "Custom Tier"}
                </span>
                <span className="font-mono font-bold text-brand">
                  {formatCurrency(tier.salePrice)}
                </span>
              </button>
            ))}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Receipt Print Preview Dialog */}
      <PrintPreviewDialog
        open={showPrintDialog}
        onOpenChange={(open) => {
          setShowPrintDialog(open);
          if (!open) {
            setPendingPrintData(null);
            focusSearch();
          }
        }}
        title="Sale Receipt"
        generateHtml={generateHtml}
        onPrint={handlePrint}
        saleData={pendingPrintData}
      />
    </div>
  );
}
