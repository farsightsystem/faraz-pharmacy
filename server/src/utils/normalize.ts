export function normalizeProduct(product: any): any {
  if (!product) return null;
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    company: product.company,
    category: product.category,
    location: product.location,
    distributor_id: product.distributorId ?? null,
    sale_price: product.salePrice ?? 0,
    purchase_price: product.purchasePrice ?? 0,
    markup_percent: product.markupPercent ?? 20,
    stock_qty: product.stockQty ?? 0,
    expiry: product.expiry ?? null,
    active: product.active ?? 1,
    created_at: product.createdAt?.toISOString?.() ?? product.createdAt,
    prices:
      product.prices?.map((p: any) => ({
        id: p.id,
        productId: p.productId,
        label: p.label,
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
      })) ?? [],
  };
}

export function normalizeProductList(products: any[]): any[] {
  return products.map(normalizeProduct);
}

export function normalizeDistributor(distributor: any): any {
  if (!distributor) return null;
  return {
    id: distributor.id,
    name: distributor.name ?? "",
    salesman_name: distributor.salesmanName ?? "",
    salesman_contact: distributor.salesmanContact ?? "",
    delivery_man_name: distributor.deliveryManName ?? "",
    delivery_man_contact: distributor.deliveryManContact ?? "",
    created_at: distributor.createdAt?.toISOString?.() ?? distributor.createdAt,
    active: distributor.active ?? 1,
    product_count: distributor._count?.products ?? 0,
  };
}

export function normalizeDistributorList(distributors: any[]): any[] {
  return distributors.map(normalizeDistributor);
}

export function normalizeStockPurchase(purchase: any): any {
  if (!purchase) return null;
  return {
    id: purchase.id,
    product_id: purchase.productId,
    product_name: purchase.product?.name ?? null,
    distributor_id: purchase.distributorId ?? null,
    distributor_name: purchase.distributor?.name ?? null,
    company: purchase.company ?? null,
    invoice_number: purchase.invoiceNumber ?? "",
    batch_id: purchase.batchId ?? null,
    batch_number: purchase.batchNumber ?? "",
    quantity: purchase.quantity ?? 0,
    purchase_price: purchase.purchasePrice ?? 0,
    sale_price: purchase.salePrice ?? 0,
    price_tier_id: purchase.priceTierId ?? null,
    expiry: purchase.expiry ?? null,
    active: purchase.active ?? 1,
    total_value: purchase.totalValue ?? 0,
    created_at: purchase.createdAt?.toISOString?.() ?? purchase.createdAt,
  };
}

export function normalizeStockPurchaseList(purchases: any[]): any[] {
  return purchases.map(normalizeStockPurchase);
}

export function normalizeSale(sale: any): any {
  if (!sale) return null;
  return {
    id: sale.id,
    customer_id: sale.customerId ?? null,
    customer_name: sale.customer?.name ?? null,
    subtotal: sale.subtotal ?? 0,
    discount: sale.discount ?? 0,
    tax: sale.tax ?? 0,
    total: sale.total ?? 0,
    amount_paid: sale.amountPaid ?? 0,
    change: sale.change ?? 0,
    status: sale.status ?? "paid",
    payment_method: sale.paymentMethod ?? null,
    invoice_no: sale.invoiceNo ?? null,
    profit: sale.profit ?? 0,
    return_count: sale._count?.returns ?? 0,
    created_at: sale.createdAt?.toISOString?.() ?? sale.createdAt,
    items:
      sale.items?.map((i: any) => ({
        id: i.id,
        sale_id: i.saleId,
        product_id: i.productId,
        product_name: i.productName,
        barcode: i.barcode,
        quantity: i.quantity,
        batch_id: i.batchId ?? null,
        batch_number: i.batchNumber ?? null,
        expiry: i.expiry ?? null,
        unit_price: i.unitPrice,
        subtotal: i.subtotal,
      })) ?? [],
  };
}

export function normalizeSaleList(sales: any[]): any[] {
  return sales.map(normalizeSale);
}
