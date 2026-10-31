export interface Category {
  id: string;
  name: string;
  active?: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CategoryInput {
  name: string;
}

export interface ProductPrice {
  id: string;
  productId: string;
  label: string;
  purchasePrice: number;
  salePrice: number;
}

export interface ProductPriceInput {
  label?: string;
  purchasePrice: number;
  salePrice?: number;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  company: string;
  category: string;
  location: string;
  distributor_id?: string;
  sale_price: number;
  purchase_price: number;
  markup_percent: number;
  stock_qty: number;
  expiry?: string;
  batch_no?: string;
  active: number;
  created_at: string;
  prices?: ProductPrice[];
}

export interface ProductInput {
  barcode: string;
  name: string;
  company?: string;
  distributorId?: string;
  salePrice?: number;
  purchasePrice: number;
  markupPercent?: number;
  category?: string;
  location?: string;
  expiry?: string;
  prices?: ProductPriceInput[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  father_name?: string;
  father_phone?: string;
  active?: number;
  created_at: string;
  total_purchases?: number;
  outstanding_arrear?: number;
  last_purchase?: string;
  purchases?: Sale[];
  arrears?: Arrear[];
}

export interface CustomerInput {
  name: string;
  phone?: string;
  address?: string;
  fatherName?: string;
  fatherPhone?: string;
}

export interface Sale {
  id: string;
  customer_id?: string;
  customer_name?: string;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  amount_paid: number;
  change: number;
  status: string;
  payment_method?: string;
  invoice_no?: string;
  profit?: number;
  created_at: string;
  return_count?: number;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
  returned_qty?: number;
  unit_price: number;
  subtotal: number;
  batch_id?: string;
  batch_number?: string;
  expiry?: string;
}

export interface SaleInput {
  customerId?: string;
  customerName?: string;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  amountPaid: number;
  items: SaleItemInput[];
}

export interface SaleItemInput {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  batchId?: string;
  batchNumber?: string;
  expiry?: string;
}

export interface Arrear {
  id: string;
  sale_id: string;
  customer_id: string;
  customer_name?: string;
  invoice_no?: string;
  total_bill: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  last_payment_date?: string;
  created_at: string;
  payments?: ArrearPayment[];
}

export interface ArrearPayment {
  id: string;
  amount: number;
  payment_sale_id: string | null;
  created_at: string;
}

export interface ArrearInput {
  customerId: string;
  totalBill: number;
  amountPaid?: number;
  saleId?: string;
}

export interface CustomerArrearSummary {
  customer_id: string;
  customer_name: string;
  phone: string;
  father_name: string;
  father_phone: string;
  address: string;
  total_bill: number;
  amount_paid: number;
  balance_due: number;
  pending_invoices: number;
  total_invoices: number;
  latest_date: string | null;
  status: "pending" | "settled";
}

export interface ArrearSaleItem {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ArrearSaleDetail {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  created_at: string;
  items: ArrearSaleItem[];
}

export interface CustomerLedgerArrear {
  id: string;
  sale_id: string | null;
  total_bill: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  created_at: string;
  sale: ArrearSaleDetail | null;
  payments: ArrearPayment[];
}

export interface CustomerLedgerPayment {
  id: string;
  arrear_id: string;
  invoice_number: string;
  amount: number;
  payment_sale_id: string | null;
  created_at: string;
}

export interface CustomerLedgerDetail {
  customer: {
    id: string;
    name: string;
    phone: string;
    father_name: string;
    father_phone: string;
    address: string;
  };
  stats: {
    total_bill: number;
    amount_paid: number;
    balance_due: number;
    pending_invoices: number;
    total_invoices: number;
  };
  arrears: CustomerLedgerArrear[];
  payments: CustomerLedgerPayment[];
}

export interface CustomerPaymentReceipt {
  receiptId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  previousBalance: number;
  amountPaid: number;
  remainingBalance: number;
  createdAt: string;
  allocated?: Array<{ arrearId: string; invoiceId: string | null; amount: number }>;
}


export interface StockPurchase {
  id: string;
  product_id: string;
  product_name?: string;
  distributor_id?: string;
  distributor_name?: string;
  company?: string;
  invoice_no?: string;
  invoice_number: string;
  batch_id?: string;
  batch_number?: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  price_tier_id?: string | null;
  stax?: number;
  expiry?: string;
  total_value: number;
  subtotal?: number;
  discount?: number;
  total_amount: number;
  amount_paid: number;
  payment_status?: string;
  date: string;
  items?: any[];
  active?: number;
  created_at: string;
}

export interface StockInput {
  productId: string;
  distributorId?: string;
  company?: string;
  invoiceNumber?: string;
  batchNumber?: string;
  purchasePrice?: number;
  salePrice?: number;
  priceTierId?: string | null;
  quantity: number;
  stax?: number;
  expiry?: string;
}

export interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  initial_qty: number;
  purchase_price: number;
  sale_price: number;
  distributor_id?: string;
  invoice_number?: string;
  active: number;
  created_at: string;
  updated_at?: string;
  distributor?: { id: string; name: string };
  product?: { id: string; name: string; barcode: string; category?: string; location?: string };
}

export interface Distributor {
  id: string;
  name: string;
  salesman_name: string;
  salesman_contact: string;
  delivery_man_name: string;
  delivery_man_contact: string;
  active?: number;
  created_at: string;
  product_count?: number;
}

export interface DistributorInput {
  name: string;
  salesmanName: string;
  salesmanContact: string;
  deliveryManName: string;
  deliveryManContact: string;
}

export interface Company {
  id: string;
  name: string;
  active?: number;
  created_at: string;
  product_count?: number;
}

export interface CompanyInput {
  name: string;
}

export interface CompanyReportRow {
  id: string;
  name: string;
  created_at: string;
  product_count: number;
  total_stock: number;
  stock_value_purchase: number;
  stock_value_retail: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expired_count: number;
  expiring_30_count: number;
  expiring_90_count: number;
  no_expiry_count: number;
}

export type CompanyReportTotals = Omit<CompanyReportRow, "id" | "name" | "created_at">;

export interface CompanyReport {
  data: CompanyReportRow[];
  totals: CompanyReportTotals;
  low_stock_threshold: number;
}

export interface CompanyDetail extends Company {
  product_count: number;
  total_stock: number;
  products: Product[];
}

export interface ReturnEntry {
  id: string;
  sale_id: string;
  customer_name?: string;
  refund_amount: number;
  reason: string;
  created_at: string;
  items?: Array<{
    product_name: string;
    quantity: number;
    refund_amount: number;
  }>;
}

export interface ReturnItemInput {
  productId: string;
  productName: string;
  quantity: number;
  refundAmount: number;
}

export interface ReturnInput {
  saleId: string;
  refundAmount: number;
  reason: string;
  items: ReturnItemInput[];
}

export interface ReturnResult extends Omit<ReturnEntry, "reason" | "items"> {
  items?: ReturnItemInput[];
  reason?: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  description?: string;
  notes: string;
  date: string;
  payment_method?: string;
  status?: string;
  active?: number;
  created_at: string;
}

export interface ExpenseInput {
  title: string;
  category: string;
  amount: number;
  notes?: string;
  date: string;
}

export type DiscountType = "pkr" | "percent";

export interface PrintMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PrinterConfig {
  paperSize: "thermal" | "a4" | "a5";
  deviceName: string | null;
  margins?: PrintMargins;
}

export interface DashboardStats {
  todayRevenue: number;
  totalArrears: number;
  lowStockCount: number;
  expiringSoonCount: number;
  weekRevenue: { day: string; revenue: number }[];
  monthRevenue: { day: string; revenue: number }[];
  topProducts: { name: string; value: number }[];
}

export interface BarcodeEntry {
  id: string;
  code: string;
  productId: string | null;
  product: { name: string; active: number } | null;
  createdAt: string;
}

export interface ProductReportData {
  product: {
    id: string;
    name: string;
    barcode: string;
    category: string;
    company: string;
    location: string;
    stockQty: number;
    purchasePrice: number;
    salePrice: number;
    markupPercent: number;
    expiry: string | null;
    active: number;
  };
  summary: {
    totalUnitsSold: number;
    totalRevenue: number;
    totalProfit: number;
    totalUnitsReturned: number;
    totalRefundAmount: number;
    netUnitsSold: number;
    netRevenue: number;
    averageUnitPrice: number;
    stockValuation: number;
    marginPercent: number;
  };
  salesHistory: Array<{
    id: string;
    saleId: string;
    createdAt: string;
    customerName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    discountApplied: number;
    profit: number;
    batchNumber: string;
    expiry: string;
  }>;
  returnItems: Array<{
    id: string;
    returnId: string;
    saleId?: string;
    createdAt?: string;
    quantity: number;
    refundAmount: number;
    reason: string;
  }>;
  batches: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    initialQty: number;
    purchasePrice: number;
    salePrice: number;
    distributorName: string;
    active: number;
  }>;
  stockPurchases: Array<{
    id: string;
    invoiceNumber: string;
    createdAt: string;
    quantity: number;
    purchasePrice: number;
    batchNumber: string;
    distributorName: string;
  }>;
}
