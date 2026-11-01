import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Check } from "lucide-react";
import ExportButtons from "@/components/reports/ExportButtons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { generatePDF } from "@/lib/pdfExport";
import { downloadExcelFile } from "@/lib/excelExport";
import type { Product } from "@/types";

const ZAKAT_RATE = 0.025;

export default function ZakatReport() {
  const [calculated, setCalculated] = useState(false);
  const [eligibleValue, setEligibleValue] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: api.products.list,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  function calculateZakat() {
    const total = products.reduce(
      (sum: number, p: Product) => sum + p.stock_qty * p.purchase_price,
      0
    );
    setEligibleValue(total);
    setCalculated(true);
  }

  const zakatAmount = eligibleValue * ZAKAT_RATE;

  function handlePDF() {
    if (!calculated) return;
    generatePDF({
      title: "Investment / Zakat Report",
      summary: [
        { label: "Eligible Stock Value", value: formatCurrency(eligibleValue) },
        { label: "Zakat Rate", value: "2.5%" },
        { label: "Estimated Zakat", value: formatCurrency(zakatAmount) },
      ],
      headers: ["Product", "Qty", "Purchase Price", "Stock Value"],
      rows: products
        .filter((p: Product) => p.stock_qty > 0)
        .map((p: Product) => [
          p.name,
          p.stock_qty,
          formatCurrency(p.purchase_price),
          formatCurrency(p.stock_qty * p.purchase_price),
        ]),
      filename: `zakat_report_${new Date().toISOString().split("T")[0]}.pdf`,
    });
  }

  function handleExcel() {
    if (!calculated) return;
    downloadExcelFile(
      `zakat_report_${new Date().toISOString().split("T")[0]}.xlsx`,
      ["Product", "Qty", "Purchase Price", "Stock Value"],
      products
        .filter((p: Product) => p.stock_qty > 0)
        .map((p: Product) => [
          p.name,
          p.stock_qty,
          p.purchase_price,
          p.stock_qty * p.purchase_price,
        ])
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Investment / Zakat Report</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Calculate zakat based on pharmacy inventory purchase value
          </p>
        </div>
        {calculated && <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />}
      </div>

      <div className="max-w-xl mx-auto">
        {!calculated ? (
          <Card className="border-dashed-2 border-border">
            <CardContent className="p-16 text-center">
              <div className="h-20 w-20 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                <Calculator className="h-10 w-10 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-2">Calculate Zakat</h3>
              <p className="text-sm text-text-secondary mb-8 max-w-sm mx-auto leading-relaxed">
                Calculate zakat based on your pharmacy inventory. The zakat rate is{" "}
                <span className="font-semibold text-accent">2.5%</span> of eligible stock value.
              </p>
              <Button
                size="lg"
                onClick={calculateZakat}
                className="px-10 h-12 text-base font-medium"
              >
                <Calculator className="h-5 w-5 mr-2" />
                Calculate / Load
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="border-border/50">
              <CardContent className="p-10">
                <div className="text-center space-y-8">
                  <div>
                    <p className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
                      Eligible Stock Value
                    </p>
                    <p className="text-4xl font-bold font-mono text-accent">
                      {formatCurrency(eligibleValue)}
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <div className="h-px flex-1 bg-border" />
                    <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-surface-2 border border-border/50">
                      <span className="text-sm font-medium text-text-secondary">Zakat Rate</span>
                      <span className="text-xl font-bold font-mono text-accent">2.5%</span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
                      Estimated Zakat
                    </p>
                    <p className="text-5xl font-bold font-mono text-success">
                      {formatCurrency(zakatAmount)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setCalculated(false);
                  setEligibleValue(0);
                }}
                className="h-9"
              >
                Recalculate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
