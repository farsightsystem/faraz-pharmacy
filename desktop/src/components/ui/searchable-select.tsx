import * as React from "react";
import { createPortal } from "react-dom";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cn } from "@/lib/utils";

const PANEL_GAP = 4;
const PANEL_MAX_HEIGHT = 288;
const FLIP_THRESHOLD = 260;

interface SearchableSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
  clearable = true,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties | null>(null);
  const [maxListHeight, setMaxListHeight] = React.useState(PANEL_MAX_HEIGHT - 54);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );
  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // The panel is portaled to <body>, so it must be positioned against the
  // trigger's viewport rect and explicitly enable pointerEvents: auto so that
  // modal dialogs (which set body pointer-events: none) do not block clicking.
  const reposition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - 8;
    const spaceAbove = rect.top - PANEL_GAP - 8;
    const flip = spaceBelow < FLIP_THRESHOLD && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(PANEL_MAX_HEIGHT, flip ? spaceAbove : spaceBelow));

    setPanelStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      pointerEvents: "auto",
      ...(flip
        ? { bottom: window.innerHeight - rect.top + PANEL_GAP }
        : { top: rect.bottom + PANEL_GAP }),
    });
    setMaxListHeight(maxHeight - 54);
  }, []);

  const close = React.useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const selectOption = React.useCallback(
    (optValue: string) => {
      onChange(optValue);
      close();
    },
    [onChange, close]
  );

  React.useEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }

    reposition();

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        close();
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    function handleViewportChange() {
      if (triggerRef.current?.getBoundingClientRect().width) reposition();
      else close();
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, reposition, close]);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  React.useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const stopBubble = (e: Event) => e.stopPropagation();
    el.addEventListener("focusin", stopBubble);
    el.addEventListener("focusout", stopBubble);
    return () => {
      el.removeEventListener("focusin", stopBubble);
      el.removeEventListener("focusout", stopBubble);
    };
  }, [open]);

  const panel = (
    <FocusScope loop trapped={false}>
      <div
        ref={panelRef}
        data-searchable-select-panel="true"
        style={panelStyle ?? undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed z-[99999] pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl animate-in fade-in zoom-in-95"
      >
        <div className="border-b border-border/60 p-1.5">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              searchInputRef.current?.focus();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filtered.length > 0 ? (prev + 1) % filtered.length : 0
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[highlightedIndex]) {
                  selectOption(filtered[highlightedIndex].value);
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            placeholder={placeholder ? `Search ${placeholder.toLowerCase()}...` : "Search..."}
            className="w-full rounded-xl border border-border/60 bg-surface-2/60 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
          />
        </div>
        <div className="overflow-y-auto p-1" style={{ maxHeight: maxListHeight }}>
          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-xs text-text-secondary">No results</p>
          ) : (
            filtered.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  // Prevent search input from blurring before click completes
                  e.preventDefault();
                }}
                onClick={() => selectOption(opt.value)}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                  opt.value === value
                    ? "bg-brand/10 text-brand font-semibold"
                    : idx === highlightedIndex
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-primary hover:bg-surface-2"
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      </div>
    </FocusScope>
  );

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs text-text-primary ring-offset-background shadow-xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer"
      >
        <span className={cn("truncate text-left flex-1", !selected && "text-text-secondary/60")}>
          {selected?.label || placeholder || "Select..."}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {clearable && Boolean(value) && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                selectOption("");
              }}
              className="p-0.5 rounded-md hover:bg-surface-2 text-text-secondary hover:text-text-primary"
              title="Clear selection"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </span>
          )}
          <svg
            className="h-3.5 w-3.5 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && panelStyle && createPortal(panel, document.body)}
    </div>
  );
}