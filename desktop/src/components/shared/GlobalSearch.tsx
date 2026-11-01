import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Package,
  Loader2,
  ArrowRight,
  Sparkles,
  MapPin,
  Building2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency } from "@/lib/utils";
import ProductDetailDrawer from "@/components/shared/ProductDetailDrawer";
import type { Product } from "@/types";

function normalizeProduct(p: any): Product {
  const stock = Number(p.stock_qty ?? p.stockQty ?? 0);
  const price = Number(p.sale_price ?? p.salePrice ?? 0);
  return {
    id: p.id,
    barcode: p.barcode || "",
    name: p.name,
    company: p.company || "",
    category: p.category || "",
    location: p.location || "",
    sale_price: price,
    purchase_price: Number(p.purchase_price ?? p.purchasePrice ?? 0),
    markup_percent: Number(p.markup_percent ?? p.markupPercent ?? 20),
    stock_qty: stock,
    expiry: p.expiry || "",
    active: p.active ?? 1,
    created_at: p.created_at || "",
    prices: p.prices || [],
  };
}

export default function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 150);
  const isSearching = query.trim().length >= 1;
  const isSearchSettled = query.trim().toLowerCase() === debouncedQuery.toLowerCase();

  // Fetch initial pool of products for random suggestions
  const {
    data: initialProductsData,
    isLoading: loadingInitial,
    refetch: refreshInitialProducts,
  } = useQuery({
    queryKey: ["global-search-catalog-sample"],
    queryFn: () => api.products.listPaginated({ page: 1, limit: 50, freshStock: true }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Pick 5 random products from the catalog to show on focus when query is empty
  const randomProducts = useMemo(() => {
    const list = initialProductsData?.data || [];
    if (list.length === 0) return [];
    // Deterministic shuffle per dataset load
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5).map(normalizeProduct);
  }, [initialProductsData]);

  // Search products when user types (triggers on 1st character)
  const {
    data: searchResults = [],
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
  } = useQuery({
    queryKey: ["global-search-products", debouncedQuery],
    queryFn: async () => {
      if (!isSearching) return [];
      const res = await api.products.listPaginated({
        page: 1,
        limit: 50,
        search: debouncedQuery,
        freshStock: true,
      });
      return (res.data || []).map(normalizeProduct);
    },
    enabled: isSearching,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isLoading = isSearching
    ? !isSearchSettled || loadingSearch || fetchingSearch
    : loadingInitial;

  // The active list of products to display: either live search results or 5 random picks
  const activeProducts = useMemo(() => {
    if (isSearching) {
      return isSearchSettled && !fetchingSearch ? searchResults : [];
    }
    return randomProducts;
  }, [isSearching, isSearchSettled, fetchingSearch, searchResults, randomProducts]);

  // Handle opening product drawer
  const handleOpenProduct = (product: Product) => {
    setSelectedProduct(product);
    setDrawerOpen(true);
    setIsOpen(false);
    setQuery("");
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < activeProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeProducts.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeProducts.length > 0 && selectedIndex >= 0 && selectedIndex < activeProducts.length) {
        handleOpenProduct(activeProducts[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeProducts]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      <div ref={containerRef} className="relative z-50">
        <div className="relative flex items-center z-50">
          <Search className="absolute left-3.5 h-4 w-4 text-text-secondary pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              if (!isSearching) void refreshInitialProducts();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search medicine by name or barcode... (⌘K)"
            className="h-10 w-80 sm:w-96 pl-10 pr-14 rounded-full border border-border bg-surface text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand shadow-xs transition-all"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 h-5 w-5 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <kbd className="absolute right-3 pointer-events-none h-5 px-1.5 rounded-full border border-border bg-surface-2 text-[10px] text-text-secondary font-mono font-medium">
              ⌘K
            </kbd>
          )}
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-full min-w-[340px] sm:min-w-[480px] bg-surface border border-border/80 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[440px] overflow-y-auto backdrop-blur-xl">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                <span className="text-xs font-medium">
                  {isSearching ? "Searching medicines..." : "Loading products..."}
                </span>
              </div>
            )}

            {!isLoading && isSearching && activeProducts.length === 0 && (
              <div className="py-9 text-center space-y-1">
                <p className="text-xs font-semibold text-text-primary">
                  No medicine found for "{debouncedQuery}"
                </p>
                <p className="text-[11px] text-text-secondary">
                  Check the spelling or try searching by barcode
                </p>
              </div>
            )}

            {!isLoading && activeProducts.length > 0 && (
              <div className="py-2 z-40">
                <div className="px-4 py-1.5 flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider font-display flex items-center gap-1.5">
                    {isSearching ? (
                      <>
                        <Package className="h-3.5 w-3.5 text-brand" />
                        Search Results ({activeProducts.length})
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        Suggested Medicines (Quick Picks)
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-text-secondary font-medium">
                    Click or press Enter to inspect
                  </span>
                </div>

                <div className="divide-y divide-border/30 pt-1">
                  {activeProducts.map((product, idx) => {
                    const isSelected = selectedIndex === idx;
                    const stockQty = Number(product.stock_qty ?? 0);
                    const isOutOfStock = stockQty <= 0;
                    const isLowStock = stockQty > 0 && stockQty < 10;
                    const company = product.company?.trim();
                    const location = product.location?.trim();

                    return (
                      <button
                        key={product.id}
                        onClick={() => handleOpenProduct(product)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-brand/10 text-brand border-l-2 border-brand"
                            : "hover:bg-surface-2/70 border-l-2 border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              isOutOfStock
                                ? "bg-danger/10 border-danger/30 text-danger"
                                : isLowStock
                                ? "bg-warning/10 border-warning/30 text-warning"
                                : "bg-success/10 border-success/30 text-success"
                            }`}
                          >
                            <Package className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-text-primary truncate">
                              {product.name}
                            </p>
                            <div className="text-[11px] text-text-secondary truncate mt-0.5 flex items-center gap-2">
                              {company && (
                                <span className="flex items-center gap-1 truncate">
                                  <Building2 className="h-3 w-3 text-text-secondary/70 shrink-0" />
                                  {company}
                                </span>
                              )}
                              {location && (
                                <span className="flex items-center gap-1 shrink-0 text-text-secondary/80 font-medium">
                                  <MapPin className="h-3 w-3 text-brand/80 shrink-0" />
                                  Rack {location}
                                </span>
                              )}
                              {!company && !location && (
                                <span className="font-mono text-[10px]">
                                  {product.barcode || "No barcode"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-text-primary font-display block">
                              {product.prices?.length
                                ? "Price options"
                                : formatCurrency(product.sale_price)}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                isOutOfStock
                                  ? "bg-danger/10 text-danger font-bold"
                                  : isLowStock
                                  ? "bg-warning/10 text-warning font-semibold"
                                  : "bg-success/10 text-success font-semibold"
                              }`}
                            >
                              {isOutOfStock
                                ? "Out of Stock"
                                : isLowStock
                                ? `Low (${stockQty})`
                                : `Stock: ${stockQty}`}
                            </span>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-text-secondary/40 shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-over Inspector Drawer */}
      <ProductDetailDrawer
        product={selectedProduct}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
