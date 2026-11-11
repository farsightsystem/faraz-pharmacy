import { useEffect, useState, useRef } from "react";
import { Barcode } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateBarcode, renderBarcode } from "@/lib/utils";
import { api } from "@/lib/api";

interface PrintBarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode?: string;
  productName?: string;
}

export default function PrintBarcodeDialog({
  open,
  onOpenChange,
  barcode: propBarcode,
  productName,
}: PrintBarcodeDialogProps) {
  const [barcode, setBarcode] = useState("");
  const [copies, setCopies] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [isNewBarcode, setIsNewBarcode] = useState(false);
  const [printers, setPrinters] = useState<
    { name: string; displayName: string; isDefault: boolean }[]
  >([]);
  const [selectedPrinter, setSelectedPrinter] = useState("default");
  const barcodeId = useRef(0);
  const [labelSize, setLabelSize] = useState(() => {
    try {
      return localStorage.getItem("faraz_label_size") || "30x20";
    } catch {
      return "30x20";
    }
  });

  useEffect(() => {
    if (!open) return;
    setBarcode("");
    setCopies(1);
    setIsNewBarcode(false);
    if (propBarcode) {
      setBarcode(propBarcode);
      return;
    }
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const [products, existingBarcodes] = await Promise.all([
          api.products.list(),
          api.barcodes.list(),
        ]);
        const existing = new Set([
          ...products.map((p) => p.barcode),
          ...existingBarcodes.map((b) => b.code),
        ]);
        let code = generateBarcode();
        while (existing.has(code)) {
          code = generateBarcode();
        }
        if (!cancelled) {
          setBarcode(code);
          setIsNewBarcode(true);
        }
      } catch {
        if (!cancelled) {
          setBarcode(generateBarcode());
          setIsNewBarcode(true);
        }
      }
      if (!cancelled) setGenerating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, propBarcode]);

  useEffect(() => {
    if (open) {
      window.electronAPI?.printers
        ?.list()
        .then(setPrinters)
        .catch(() => setPrinters([]));
    }
  }, [open]);

  useEffect(() => {
    if (!barcode || !open) return;
    barcodeId.current++;
    const id = barcodeId.current;
    const svg = document.getElementById("barcode-svg") as unknown as SVGElement;
    if (!svg) return;
    requestAnimationFrame(() => {
      if (id !== barcodeId.current) return;
      const [w, h] = labelSize.split("x").map(Number);
      const isSmall = (h || 20) <= 22;
      const isNarrow = (w || 30) <= 30;
      renderBarcode(svg, barcode, {
        width: isNarrow ? 1.05 : isSmall ? 1.2 : 1.4,
        height: isSmall ? 24 : 36,
        fontSize: isNarrow ? 8.5 : isSmall ? 9 : 11,
        margin: 0,
        displayValue: true,
      });
    });
  }, [barcode, open, labelSize]);

  async function handlePrint() {
    try {
      if (isNewBarcode) {
        await api.barcodes.create(barcode);
      }
      const svgEl = document.getElementById("barcode-svg") as unknown as SVGElement | null;
      const svgHtml = svgEl ? svgEl.outerHTML : "";
      const [labelWidth, labelHeight] = labelSize.split("x").map(Number);
      const result = await window.printBarcodeLabel(
        barcode,
        copies,
        svgHtml,
        labelWidth,
        labelHeight,
        selectedPrinter === "default" ? undefined : selectedPrinter,
        productName
      );
      if (!result.success) {
        toast.error("Barcode print failed: " + (result.error || "Unknown error"));
      } else {
        toast.success(
          copies > 1
            ? `${copies} barcode labels sent to printer`
            : "Barcode label sent to printer"
        );
        onOpenChange(false);
      }
    } catch (e) {
      toast.error("Barcode print failed: " + (e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold font-display">
            <Barcode className="h-5 w-5 text-brand" />
            Print Barcode
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 space-y-4">
          {generating ? (
            <div className="flex items-center justify-center h-24 text-xs text-text-secondary">
              Generating unique barcode...
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-white text-black shadow-xs w-full max-w-[240px] mx-auto min-h-[90px] overflow-hidden">
                {productName ? (
                  <p className="text-[11px] font-bold text-gray-900 text-center truncate w-full mb-1.5 px-1 font-display">
                    {productName}
                  </p>
                ) : null}
                <div className="flex items-center justify-center w-full">
                  <svg id="barcode-svg" className="max-w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text-primary">Label Size</Label>
                  <Select
                    value={labelSize}
                    onValueChange={(val) => {
                      setLabelSize(val);
                      try {
                        localStorage.setItem("faraz_label_size", val);
                      } catch {}
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-xl">
                      <SelectValue placeholder="Label size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30x20">30 × 20 mm (Default)</SelectItem>
                      <SelectItem value="35x20">35 × 20 mm</SelectItem>
                      <SelectItem value="40x25">40 × 25 mm</SelectItem>
                      <SelectItem value="50x25">50 × 25 mm</SelectItem>
                      <SelectItem value="50x30">50 × 30 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text-primary">Copies</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={copies}
                    onChange={(e) =>
                      setCopies(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-text-primary">Printer</Label>
                <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue placeholder="Default printer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Printer</SelectItem>
                    {printers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.displayName}{" "}
                        {p.isDefault ? <span className="text-text-secondary">(Default)</span> : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {printers.length === 0 && (
                  <p className="text-[10px] text-text-secondary">
                    No installed printers detected. Make sure the printer driver is installed.
                  </p>
                )}
              </div>
              <Button
                className="w-full h-10 rounded-xl bg-gradient-to-r from-[#4A25E1] to-[#3612B8] text-white hover:from-[#3e1ed1] hover:to-[#2e0ea3] shadow-md shadow-brand/20 font-medium"
                onClick={handlePrint}
              >
                Print {copies} label{copies > 1 ? "s" : ""}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
