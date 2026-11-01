import { useState, useMemo, useCallback } from "react";
import type { SaleItemInput, DiscountType } from "@/types";
import { toast } from "sonner";

export interface CartItem extends SaleItemInput {
  id: string;
  purchasePrice: number;
  stockQty: number;
}

export interface SaleState {
  id: string;
  label: string;
  items: CartItem[];
  discountValue: number;
  discountType: DiscountType;
  taxValue: number;
  taxType: DiscountType;
  customerId?: string;
  customerName?: string;
  notes: string;
  amountPaid: string;
  addToArrears: boolean;
}

let tempCounter = 1;

function createSaleState(seq: number): SaleState {
  const padded = String(seq).padStart(3, "0");
  return {
    id: `SALE-TEMP-${padded}`,
    label: `Sale ${padded}`,
    items: [],
    discountValue: 0,
    discountType: "pkr",
    taxValue: 0,
    taxType: "pkr",
    customerId: undefined,
    customerName: undefined,
    notes: "",
    amountPaid: "",
    addToArrears: false,
  };
}

function normalizeSaleState(sale: SaleState): SaleState {
  const subtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0);
  const maxDiscount = sale.discountType === "percent" ? 100 : subtotal;

  return {
    ...sale,
    discountValue: Math.min(maxDiscount, Math.max(0, sale.discountValue)),
    taxValue: Math.max(0, sale.taxValue),
  };
}

export function useMultiSale() {
  const [sales, setSales] = useState<SaleState[]>(() => [createSaleState(1)]);
  const [activeId, setActiveId] = useState<string>(`SALE-TEMP-001`);

  const activeSale = useMemo(
    () => sales.find((s) => s.id === activeId) ?? sales[0],
    [sales, activeId]
  );

  const updateActive = useCallback(
    (patch: Partial<SaleState> | ((s: SaleState) => SaleState)) => {
      setSales((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? normalizeSaleState(typeof patch === "function" ? patch(s) : { ...s, ...patch })
            : s
        )
      );
    },
    [activeId]
  );

  const newSale = useCallback(() => {
    tempCounter += 1;
    const sale = createSaleState(tempCounter);
    setSales((prev) => [...prev, sale]);
    setActiveId(sale.id);
  }, []);

  const switchSale = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const closeSale = useCallback(
    (id: string) => {
      const idx = sales.findIndex((s) => s.id === id);
      if (idx === -1) return;
      const next = sales.filter((s) => s.id !== id);
      if (next.length === 0) {
        tempCounter += 1;
        const fresh = createSaleState(tempCounter);
        setActiveId(fresh.id);
        setSales([fresh]);
        return;
      }
      setActiveId((current) =>
        current === id ? next[Math.min(idx, next.length - 1)].id : current
      );
      setSales(next);
    },
    [sales]
  );

  const subtotal = useMemo(
    () => activeSale.items.reduce((s, i) => s + i.subtotal, 0),
    [activeSale.items]
  );

  const discount = useMemo(() => {
    if (activeSale.discountType === "percent") {
      return Math.round((subtotal * activeSale.discountValue) / 100);
    }
    return activeSale.discountValue;
  }, [subtotal, activeSale.discountValue, activeSale.discountType]);

  const tax = useMemo(() => {
    if (activeSale.taxValue <= 0) return 0;
    if (activeSale.taxType === "percent") {
      const taxableAmount = Math.max(0, subtotal - discount);
      return Math.round((taxableAmount * activeSale.taxValue) / 100);
    }
    return activeSale.taxValue;
  }, [subtotal, discount, activeSale.taxValue, activeSale.taxType]);

  const total = useMemo(() => Math.max(0, subtotal - discount + tax), [subtotal, discount, tax]);

  const costOfGoods = useMemo(
    () => activeSale.items.reduce((s, i) => s + i.purchasePrice * i.quantity, 0),
    [activeSale.items]
  );

  const profit = useMemo(() => Math.round(total - tax - costOfGoods), [total, tax, costOfGoods]);

  const toggleDiscountType = useCallback(() => {
    updateActive((s) => {
      let value = s.discountValue;
      let type: DiscountType = s.discountType;
      if (type === "pkr") {
        const pct = subtotal > 0 ? Math.round((s.discountValue * 100) / subtotal) : 0;
        value = Math.min(pct, 100);
        type = "percent";
      } else {
        value = discount;
        type = "pkr";
      }
      return { ...s, discountValue: value, discountType: type };
    });
  }, [updateActive, subtotal, discount]);

  const toggleTaxType = useCallback(() => {
    updateActive((s) => {
      let value = s.taxValue;
      let type: DiscountType = s.taxType;
      if (type === "pkr") {
        const taxable = Math.max(0, subtotal - discount);
        const pct = taxable > 0 ? Math.round((s.taxValue * 100) / taxable) : 0;
        value = Math.min(pct, 100);
        type = "percent";
      } else {
        value = tax;
        type = "pkr";
      }
      return { ...s, taxValue: value, taxType: type };
    });
  }, [updateActive, subtotal, discount, tax]);

  const addItem = useCallback(
    (product: {
      id: string;
      name: string;
      barcode: string;
      sale_price: number;
      purchase_price?: number;
      stock_qty: number;
    }) => {
      updateActive((s) => {
        const existing = s.items.find((i) => i.productId === product.id);
        if (existing) {
          if (existing.quantity + 1 > existing.stockQty) {
            toast.error(`Cannot add more. Only ${existing.stockQty} in stock.`);
            return s;
          }
          return {
            ...s,
            items: s.items.map((i) =>
              i.productId === product.id
                ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice }
                : i
            ),
          };
        }
        if (product.stock_qty < 1) {
          toast.error("Out of stock");
          return s;
        }
        return {
          ...s,
          items: [
            ...s.items,
            {
              id: crypto.randomUUID(),
              productId: product.id,
              productName: product.name,
              barcode: product.barcode,
              quantity: 1,
              unitPrice: product.sale_price,
              purchasePrice: product.purchase_price ?? 0,
              stockQty: product.stock_qty,
              subtotal: product.sale_price,
              batchId: (product as any).batch_id || (product as any).batchId || undefined,
              batchNumber: (product as any).batch_number || (product as any).batchNumber || undefined,
              expiry: (product as any).expiry || undefined,
            },
          ],
        };
      });
    },
    [updateActive]
  );

  const updateItemBatch = useCallback(
    (
      productId: string,
      batch: { id: string; batchNumber: string; expiryDate: string; salePrice?: number }
    ) => {
      updateActive((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.productId === productId) {
            const unitPrice = batch.salePrice ?? i.unitPrice;
            return {
              ...i,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              expiry: batch.expiryDate,
              unitPrice,
              subtotal: i.quantity * unitPrice,
            };
          }
          return i;
        }),
      }));
    },
    [updateActive]
  );

  const incrementBy = useCallback(
    (productId: string, amount: number) => {
      updateActive((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.productId === productId) {
            const nextQty = i.quantity + amount;
            if (nextQty > i.stockQty) {
              toast.error(`Cannot add more. Only ${i.stockQty} in stock.`);
              return i;
            }
            return { ...i, quantity: nextQty, subtotal: nextQty * i.unitPrice };
          }
          return i;
        }),
      }));
    },
    [updateActive]
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(productId);
        return;
      }
      updateActive((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.productId === productId) {
            if (quantity > i.stockQty) {
              toast.error(`Cannot add more. Only ${i.stockQty} in stock.`);
              return { ...i, quantity: i.stockQty, subtotal: i.stockQty * i.unitPrice };
            }
            return { ...i, quantity, subtotal: quantity * i.unitPrice };
          }
          return i;
        }),
      }));
    },
    [updateActive]
  );

  const removeItem = useCallback(
    (productId: string) => {
      updateActive((s) => ({ ...s, items: s.items.filter((i) => i.productId !== productId) }));
    },
    [updateActive]
  );

  const setCustomer = useCallback(
    (id?: string, name?: string) => {
      updateActive({ customerId: id, customerName: name });
    },
    [updateActive]
  );

  const setDiscountValue = useCallback(
    (value: number) => updateActive({ discountValue: value }),
    [updateActive]
  );

  const setDiscountType = useCallback(
    (value: DiscountType) => updateActive({ discountType: value }),
    [updateActive]
  );

  const setTaxValue = useCallback(
    (value: number) => updateActive({ taxValue: value }),
    [updateActive]
  );

  const setTaxType = useCallback(
    (value: DiscountType) => updateActive({ taxType: value }),
    [updateActive]
  );

  const setNotes = useCallback((notes: string) => updateActive({ notes }), [updateActive]);

  const setAmountPaid = useCallback(
    (amountPaid: string) => updateActive({ amountPaid }),
    [updateActive]
  );

  const setAddToArrears = useCallback(
    (addToArrears: boolean) => updateActive({ addToArrears }),
    [updateActive]
  );

  const clearCart = useCallback(() => {
    updateActive({
      items: [],
      discountValue: 0,
      discountType: "pkr",
      taxValue: 0,
      taxType: "pkr",
      customerId: undefined,
      customerName: undefined,
      notes: "",
      amountPaid: "",
      addToArrears: false,
    });
  }, [updateActive]);

  return {
    items: activeSale.items,
    discount,
    discountValue: activeSale.discountValue,
    discountType: activeSale.discountType,
    tax,
    taxValue: activeSale.taxValue,
    taxType: activeSale.taxType,
    subtotal,
    total,
    profit,
    customerId: activeSale.customerId,
    customerName: activeSale.customerName,
    notes: activeSale.notes,
    amountPaid: activeSale.amountPaid,
    addToArrears: activeSale.addToArrears,
    setCustomer,
    setDiscountValue,
    setDiscountType,
    toggleDiscountType,
    setTaxValue,
    setTaxType,
    toggleTaxType,
    addItem,
    updateItemBatch,
    incrementBy,
    updateQuantity,
    removeItem,
    clearCart,
    setNotes,
    setAmountPaid,
    setAddToArrears,
    sales,
    activeSale,
    activeId,
    newSale,
    switchSale,
    closeSale,
  };
}
