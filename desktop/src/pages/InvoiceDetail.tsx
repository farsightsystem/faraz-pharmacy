import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Receipt, User, CreditCard, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import PrintPreviewDialog from "@/components/shared/PrintPreviewDialog";
import type { Sale, PrinterConfig } from "@/types";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);
  const [showProfit, setShowProfit] = useState(false);

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => api.sales.getById(id!),
    enabled: !!id,
  });

  const generateReceiptHtml = useCallback(
    async (paperSize: string): Promise<string> => {
      if (!sale) return "";
      const printData = {
        ...sale,
        customer_total_arrears: sale.customer_outstanding_arrear ?? 0,
        items:
          sale.items?.map((i) => ({
            product_name: i.product_name,
            batch_number: i.batch_number,
            expiry: i.expiry,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal,
          })) || [],
      };
      const result = await window.generateReceiptHTML(printData, paperSize);
      return result.success ? result.html : "";
    },
    [sale]
  );

  async function handlePrint(config: PrinterConfig) {
    if (!sale) return;
    const printData = {
      ...sale,
      customer_total_arrears: sale.customer_outstanding_arrear ?? 0,
      items:
        sale.items?.map((i) => ({
          product_name: i.product_name,
          batch_number: i.batch_number,
          expiry: i.expiry,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        })) || [],
    };
    const result = await window.printReceipt(printData, config);
    if (!result.success) {
      throw new Error(result.error || "Print failed");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Receipt className="h-12 w-12 text-text-secondary/40" />
        <p className="text-sm text-text-secondary">Invoice not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const itemCount = sale.items?.length ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/invoices")}
            className="rounded-xl h-9 px-3 gap-1.5 text-xs text-text-secondary hover:text-text-primary shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Button>
          <div>
            <h1 className="text-xl font-display font-bold text-text-primary tracking-tight">
              Invoice Detail
            </h1>
            <p className="text-xs text-text-secondary font-mono">{sale.id}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowPreview(true)}
          className="rounded-xl h-9 px-4 gap-1.5 bg-gradient-to-r from-[#4A25E1] to-[#3612B8] text-white hover:from-[#3e1ed1] hover:to-[#2e0ea3] shadow-md shadow-brand/20 font-medium text-xs"
        >
          <Printer className="h-3.5 w-3.5" />
          Print Receipt
        </Button>
      </div>

      <div className="space-y-4">
        {/* Info Grid Card */}
        <div className="rounded-2xl border border-border/80 bg-surface p-6 shadow-xs">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3.5">
              <div>
                <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                  Date & Time
                </p>
                <p className="text-sm font-semibold text-text-primary">
                  {formatDateTime(sale.created_at)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                  Invoice ID
                </p>
                <p className="text-sm font-mono text-text-primary">{sale.id}</p>
              </div>
              {sale.invoice_no && (
                <div>
                  <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                    Invoice No
                  </p>
                  <p className="text-sm font-mono text-text-primary">{sale.invoice_no}</p>
                </div>
              )}
            </div>
            <div className="space-y-3.5">
              <div>
                <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                  Customer
                </p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-brand" />
                  <p className="text-sm font-semibold text-text-primary">
                    {sale.customer_name || "Walk-in Customer"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                  Status
                </p>
                <StatusBadge status={sale.status} />
              </div>
              {sale.payment_method && (
                <div>
                  <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider mb-1">
                    Payment Method
                  </p>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-brand" />
                    <p className="text-sm font-semibold text-text-primary capitalize">
                      {sale.payment_method}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Purchased Items Card */}
        <div className="rounded-2xl border border-border/80 bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
            <Package className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-bold font-display text-text-primary">Purchased Items ({itemCount})</h3>
          </div>
          <div className="space-y-1">
            {(sale.items || []).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 px-3.5 rounded-xl hover:bg-surface-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {item.product_name}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>
                      {item.quantity} &times; {formatCurrency(item.unit_price)}
                    </span>
                    {item.barcode && <span className="font-mono text-[10px]">({item.barcode})</span>}
                    {item.batch_number && (
                      <span className="font-mono text-[10px] text-brand font-medium bg-brand/10 px-1.5 py-0.5 rounded">
                        Batch: {item.batch_number}
                        {item.expiry && ` · Exp: ${item.expiry.slice(0, 7)}`}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-text-primary tabular-nums ml-3">
                  {formatCurrency(item.subtotal)}
                </span>
              </div>
            ))}
            {(!sale.items || sale.items.length === 0) && (
              <p className="text-xs text-text-secondary text-center py-6">No items</p>
            )}
          </div>
        </div>

        {/* Payment Summary Card */}
        <div className="rounded-2xl border border-border/80 bg-surface p-6 shadow-xs">
          <h3 className="text-sm font-bold font-display text-text-primary mb-4 pb-3 border-b border-border/60">
            Payment Summary
          </h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Subtotal</span>
              <span className="font-mono text-text-primary font-semibold tabular-nums">
                {formatCurrency(sale.subtotal)}
              </span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Discount</span>
                <span className="font-mono text-danger font-semibold tabular-nums">
                  &minus;{formatCurrency(sale.discount)}
                </span>
              </div>
            )}
            {sale.tax && sale.tax > 0 ? (
              <div className="flex justify-between">
                <span className="text-text-secondary">Tax</span>
                <span className="font-mono text-text-primary font-semibold tabular-nums">
                  +{formatCurrency(sale.tax)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold pt-2.5 border-t border-border/80">
              <span className="text-text-primary">Total</span>
              <span className="font-mono text-brand tabular-nums">{formatCurrency(sale.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Paid</span>
              <span className="font-mono text-success font-semibold tabular-nums">
                {formatCurrency(sale.amount_paid)}
              </span>
            </div>
            {sale.change > 0 && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Change</span>
                <span className="font-mono text-text-primary font-semibold tabular-nums">
                  {formatCurrency(sale.change)}
                </span>
              </div>
            )}
            {sale.status === "partial" && (
              <div className="flex justify-between pt-2 border-t border-border/80">
                <span className="text-warning font-semibold">Balance Due</span>
                <span className="font-mono text-warning font-bold tabular-nums">
                  {formatCurrency(sale.total - sale.amount_paid)}
                </span>
              </div>
            )}
            <button
              onClick={() => setShowProfit(!showProfit)}
              className="flex justify-between pt-3 border-t border-border/60 w-full cursor-pointer hover:bg-surface-2 -mx-6 px-6 -mb-6 pb-6 rounded-b-2xl transition-colors"
            >
              <span className="text-text-secondary font-medium">Profit</span>
              <span
                className={`font-mono font-semibold tabular-nums ${(sale.profit ?? 0) >= 0 ? "text-success" : "text-danger"}`}
              >
                {showProfit ? formatCurrency(sale.profit ?? 0) : "••••"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {showPreview && (
        <PrintPreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          title="Invoice Receipt"
          htmlGenerator={generateReceiptHtml}
          onPrint={handlePrint}
        />
      )}
    </div>
  );
}
