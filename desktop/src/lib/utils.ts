import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import JsBarcode from "jsbarcode";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RenderBarcodeOptions {
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
}

export function renderBarcode(
  svg: SVGElement,
  value: string,
  options: RenderBarcodeOptions = {}
): boolean {
  const opts = {
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 14,
    margin: 8,
    ...options,
  };
  try {
    JsBarcode(svg, value, { format: "EAN13", ...opts });
    return true;
  } catch {
    try {
      JsBarcode(svg, value, { format: "CODE128", ...opts });
      return true;
    } catch {
      return false;
    }
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  const val = Number(amount ?? 0);
  if (isNaN(val)) return "Rs\u00a00";
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateBarcode(): string {
  const digits = "890" + Math.random().toString().slice(2, 11);
  return addEAN13CheckDigit(digits);
}

export function addEAN13CheckDigit(code: string): string {
  const d = code.replace(/\D/g, "").slice(0, 12);
  if (d.length < 12) return code;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(d[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return d + check;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
