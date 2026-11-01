import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types";

interface ProductSearchDropdownProps {
  isOpen: boolean;
  products: Product[];
  highlightedIndex: number;
  onSelect: (product: Product) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLInputElement | null>;
}

export default function ProductSearchDropdown({
  isOpen,
  products,
  highlightedIndex,
  onSelect,
  onClose,
  triggerRef,
}: ProductSearchDropdownProps) {
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 6 - 8;
    const maxHeight = Math.max(140, Math.min(320, spaceBelow));

    setPanelStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 6,
      zIndex: 99999,
      pointerEvents: "auto",
      maxHeight,
    });
  }, [triggerRef]);

  // Keep highlighted item in view
  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [isOpen, highlightedIndex]);

  useEffect(() => {
    if (!isOpen) {
      setPanelStyle(null);
      return;
    }

    reposition();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current !== target &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, reposition, onClose, triggerRef]);

  if (!isOpen || !panelStyle || products.length === 0) return null;

  const panel = (
    <div
      ref={panelRef}
      style={panelStyle}
      className="fixed z-[99999] pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl animate-in fade-in zoom-in-95"
    >
      <div
        className="overflow-y-auto p-1.5 space-y-0.5"
        style={{ maxHeight: parseInt(String(panelStyle.maxHeight) || "320", 10) - 10 }}
      >
        {products.map((product, idx) => {
          const isSelected = idx === highlightedIndex;
          const isOutOfStock = product.stock_qty <= 0;

          return (
            <button
              key={product.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(product);
              }}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer flex items-center justify-between gap-3",
                isSelected
                  ? "bg-accent text-white shadow-xs"
                  : "text-text-primary hover:bg-surface-2",
                isOutOfStock && !isSelected && "opacity-60"
              )}
            >
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-semibold truncate">{product.name}</span>
                <div
                  className={cn(
                    "flex items-center gap-2 text-[10px]",
                    isSelected ? "text-white/80" : "text-text-secondary"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      isOutOfStock
                        ? "bg-danger"
                        : product.stock_qty <= 5
                          ? "bg-warning"
                          : "bg-success"
                    )}
                  />
                  <span>
                    {isOutOfStock
                      ? "Out of stock"
                      : product.stock_qty <= 5
                        ? `Only ${product.stock_qty} left`
                        : `${product.stock_qty} in stock`}
                  </span>
                  {product.barcode && (
                    <>
                      <span>•</span>
                      <span className="font-mono">{product.barcode}</span>
                    </>
                  )}
                </div>
              </div>

              <span
                className={cn(
                  "font-mono font-bold text-xs whitespace-nowrap",
                  isSelected ? "text-white" : "text-brand"
                )}
              >
                {product.prices?.length ? "Price options" : formatCurrency(product.sale_price)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
