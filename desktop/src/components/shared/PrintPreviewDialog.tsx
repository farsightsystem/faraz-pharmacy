import { useState, useEffect, useRef } from "react";
import { Printer, FileText, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { PrinterConfig, PrintMargins } from "@/types";

const PAPER_SIZES = [
  { value: "thermal", label: "Thermal (80mm)" },
] as const;

const DEFAULT_MARGINS: PrintMargins = { top: 0, bottom: 0, left: 0, right: 0 };

interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  htmlGenerator?: (paperSize: string) => Promise<string>;
  generateHtml?: (paperSize: string) => Promise<string>;
  onPrint?: (config: PrinterConfig) => Promise<void>;
  initialPaperSize?: string; // kept for API compatibility; only "thermal" is supported now
  saleData?: unknown;
}

export default function PrintPreviewDialog({
  open,
  onOpenChange,
  title = "Receipt Preview",
  htmlGenerator,
  generateHtml,
  onPrint,
  initialPaperSize = "thermal",
}: PrintPreviewDialogProps) {
  const [paperSize, setPaperSize] = useState<string>(initialPaperSize);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("default");
  const [printers, setPrinters] = useState<
    { name: string; displayName: string; isDefault: boolean }[]
  >([]);
  const [margins, setMargins] = useState<PrintMargins>(DEFAULT_MARGINS);
  const [html, setHtml] = useState("");
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [printing, setPrinting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [savedConfig, setSavedConfig] = useState<PrinterConfig>({
    paperSize: "thermal",
    deviceName: null,
  });

  useEffect(() => {
    if (window.electronAPI?.printers) {
      window.electronAPI.printers.getConfig().then((cfg) => {
        setSavedConfig(cfg);
        setPaperSize("thermal"); // A4/A5 removed — thermal is the only size now
        if (cfg.deviceName) setSelectedPrinter(cfg.deviceName);
        setMargins(DEFAULT_MARGINS);
      });
      window.electronAPI.printers.list().then(setPrinters);
    }
  }, []);

  const generator = htmlGenerator || generateHtml;

  useEffect(() => {
    if (!open) return;
    if (!generator) {
      setLoadingHtml(false);
      return;
    }
    setLoadingHtml(true);
    generator(paperSize)
      .then((h) => {
        setHtml(h || "");
        setLoadingHtml(false);
      })
      .catch(() => setLoadingHtml(false));
  }, [open, paperSize, generator]);

  useEffect(() => {
    if (!open) return;
    if (!savedConfig.margins) setMargins(DEFAULT_MARGINS);
  }, [paperSize, open]);

  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  async function handlePrint() {
    setPrinting(true);
    try {
      const config: PrinterConfig = {
        paperSize: "thermal",
        deviceName: selectedPrinter === "default" ? null : selectedPrinter,
      };
      window.electronAPI?.printers?.saveConfig(config);
      if (onPrint) await onPrint(config);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Print failed");
    }
    setPrinting(false);
  }

  const previewWidth = 320;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold font-display">
            <Eye className="h-4 w-4 text-brand" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-3 pb-2 space-y-2.5">
          <div className="flex items-end gap-2.5 flex-wrap">
            <div className="space-y-1">
              <Label className="text-[10px] text-text-secondary font-medium">Paper Size</Label>
              <div className="flex gap-1.5">
                {PAPER_SIZES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPaperSize(value)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      paperSize === value
                        ? "border-brand bg-brand/10 text-brand shadow-xs"
                        : "border-border/80 text-text-secondary hover:border-brand/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 flex-1 min-w-[160px] max-w-[220px]">
              <Label className="text-[10px] text-text-secondary font-medium">Printer</Label>
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger className="h-8 text-xs rounded-xl">
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
            </div>

          </div>
        </div>

        <div className="flex-1 min-h-0 px-5 py-2 overflow-auto flex justify-center bg-surface-2/30">
          {loadingHtml ? (
            <div className="flex items-center justify-center w-full h-48 text-xs text-text-secondary">
              <div className="flex flex-col items-center gap-2">
                <span className="h-5 w-5 rounded-full border-2 border-border border-t-brand animate-spin" />
                Loading preview...
              </div>
            </div>
          ) : html ? (
            <div
              className="border border-border/80 rounded-2xl overflow-hidden bg-white shadow-xs"
              style={{ width: previewWidth, minHeight: 200 }}
            >
              <iframe
                ref={iframeRef}
                title="Print Preview"
                style={{
                  width: "100%",
                  minHeight: 400,
                  border: "none",
                  display: "block",
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-48 text-xs text-text-secondary">
              No preview available
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/80">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={printing || loadingHtml}
            className="rounded-xl gap-1.5 text-xs bg-gradient-to-r from-[#4A25E1] to-[#3612B8] text-white hover:from-[#3e1ed1] hover:to-[#2e0ea3] shadow-md shadow-brand/20 font-medium"
          >
            <Printer className="h-3.5 w-3.5" />
            {printing ? "Printing..." : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
