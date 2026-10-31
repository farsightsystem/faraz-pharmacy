import { BrowserWindow, app } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logoPath = `file://${path.join(__dirname, "image", "logo.png").replace(/\\/g, "/")}`;
const logoBase64 = (() => {
  try {
    const buf = fs.readFileSync(path.join(__dirname, "image", "logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
})();

const jsBarcodeSource = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, "vendor", "JsBarcode.all.min.js"), "utf-8");
  } catch {
    return "";
  }
})();

function generateSaleReceiptHTML(sale) {
  const items = sale.items || [];

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const timeStr = now.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const subtotal = Number(sale.subtotal || 0);
  const totalAmount = Number(sale.total || 0);
  const discount = Number(sale.discount || 0);
  const gst = Number(sale.tax || sale.gst || 0);
  const paid = Number(sale.amount_paid ?? sale.amountPaid ?? 0);
  const balance = Math.max(0, totalAmount - paid);
  const arrears = Number(sale.customer_total_arrears ?? sale.customerTotalArrears ?? sale.arrears ?? 0);
  const totalPayable = totalAmount + arrears;

  const itemsHTML = items
    .map((item) => {
      const name = item.product_name ?? item.productName ?? "Item";
      const batchNo = item.batch_number ?? item.batchNumber;
      const expiry = item.expiry;
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? (item.quantity > 0 ? item.subtotal / item.quantity : 0));
      const subtotal = Number(item.subtotal || 0);

      return `
      <tr>
          <td>
            ${name}
            ${batchNo ? `<div style="font-size:8.5px;color:#555;">B:${batchNo}${expiry ? ` Exp:${String(expiry).slice(0, 7)}` : ""}</div>` : ""}
          </td>
          <td>${item.quantity}</td>
          <td>${Math.round(unitPrice)}</td>
          <td class="right">${subtotal.toFixed(0)}</td>
      </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<style>

@page{
    size:75mm auto;
    margin:0;
    display:flex,
    justify-content: center,
}

*{
    box-sizing:border-box;
}

body{
    width:70mm;
    margin:5;
    padding:5;
    font-family:Arial,sans-serif;
    font-size:12px;
    color:#000;
}

.center{
    text-align:center;
}

.bold{
    font-weight:550;
}

.right{
    text-align:start;
}

.header h1{
    margin:0;
    font-size:18px;
}

.header p{
    margin:2px 0;
    font-size:11px;
}

.info{
    margin-top:8px;
    line-height:1.1;
}

.divider{
    border-top:1.5px dashed #000;
    margin:6px 0;
}

table{
    width:100%;
    border-collapse:collapse;
}

th{
    text-align:left;
    border-bottom:1.5px dashed #000;
    padding-bottom:3px;
    font-size:12px;
}

td{
    padding:2px 0;
    font-size:12px;
    vertical-align:top;
    text-center: start,
}

.totals-container{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    margin-top:6px;
    gap:5px;
}

.urdu-notes{
    width:54%;
    direction:rtl;
    font-size:10px;
    line-height:1.2;
    padding:3px
}

.calculation{
    width:46%;
    font-size:11px;
}

.calc-row{
    display:flex;
    justify-content:space-between;
    margin-bottom:2px;
}

.total-payable{
    border-top:1px solid #000;
    border-bottom:1px solid #000;
    padding:3px 0;
    font-weight:bold;
    margin:4px 0;
}

.footer{
    margin-top:8px;
    font-size:9px;
}

</style>

</head>

<body>

<div class="header center">
    <h1>FARAZ PHARMACY</h1>
    <p>Beside Numan Clinical Laboratory Barikot, Swat</p>
    <p>Phone: 0346-9383792 | 0344-9006940</p>
</div>

<div class="info">
    <div><span class="bold">Invoice #: ${sale.id ?? ""}</span></div>
    <div><span class="bold">Date: ${dateStr} ${timeStr}</span></div>
    <div><span class="bold">Customer Name: ${sale.customer_name || "Walk-in Customer"}</span></div>
    <div><span class="bold">No. of Items : ${items.length}</span> </div>
</div>

<div class="divider"></div>

<table>

<thead>

<tr>
<th width="55%">Product Name</th>
<th width="10%">Qty</th>
<th width="20%">Price</th>
<th width="15%" class="right">Amount</th>
</tr>

</thead>

<tbody>

${itemsHTML}

</tbody>

</table>

<div class="divider"></div>

<div class="totals-container">

<div class="urdu-notes">

<div class="bold">ضروری نوٹ</div>

<div>- رسید کے بغیر کوئی واپسی نہیں</div>

<div>- فریج کی دواؤں کی کوئی واپسی نہیں</div>

<div>- دواؤں کی 3 دن بعد کوئی واپسی نہیں</div>

</div>

<div class="calculation">

<div class="calc-row">
<span>Total Amount:</span>
<span>${subtotal}</span>
</div>

<div class="calc-row">
<span>Discount:</span>
<span>${discount}</span>
</div>

<div class="calc-row">
<span>${gst > 0 ? "Tax / GST:" : "GST (0%):"}</span>
<span>${gst}</span>
</div>

<div class="calc-row">
<span>Arrears:</span>
<span>${arrears}</span>
</div>

<div class="total-payable calc-row">
<span>Total Payable:</span>
<span>${totalPayable}</span>
</div>

<div class="calc-row">
<span>Amount Paid:</span>
<span>${paid}</span>
</div>

<div class="calc-row">
<span>Balance:</span>
<span>${balance}</span>
</div>

</div>

</div>

<div class="divider"></div>

<div class="footer center">

Developed by www.farsightsystem.com 

</div>

<div class="divider"></div>

</body>

</html>
`;
}

function generateA4InvoiceHTML(sale) {
  const items = sale.items || [];
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@page { margin: 12mm; size: A4; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  font-size: 11px; color: #1a1a1a; line-height: 1.5;
}
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 3px solid #0D9488; padding-bottom: 14px; }
.header-left { display: flex; align-items: center; gap: 10px; }
.header-logo { width: 44px; height: 44px; border-radius: 8px; object-fit: contain; }
.header h1 { font-size: 24px; letter-spacing: 1px; color: #0D9488; font-weight: 800; margin: 0; }
.header p { font-size: 11px; color: #666; margin-top: 2px; }
.header .addr { font-size: 10px; color: #888; margin-top: 1px; }
.header-right { text-align: right; }
.header-right .inv-label { font-size: 16px; font-weight: 800; color: #0D9488; letter-spacing: 1px; }
.header-right .inv-id { font-size: 9px; color: #fff; background: #0D9488; padding: 3px 8px; border-radius: 3px; margin-top: 3px; display: inline-block; }
.info { display: flex; justify-content: space-between; margin-bottom: 14px; background: #f9fafb; padding: 10px 14px; border-radius: 5px; }
.info div { font-size: 10.5px; }
.info .lbl { color: #9ca3af; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
thead th {
  background: #0D9488; color: #fff; text-align: left; padding: 7px 8px;
  font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
}
thead th:first-child { border-radius: 4px 0 0 0; }
thead th:last-child { border-radius: 0 4px 0 0; }
td { padding: 6px 8px; font-size: 10.5px; border-bottom: 1px solid #eee; }
td:last-child, th:last-child { text-align: right; }
td:nth-child(2) { text-align: center; }
tbody tr:nth-child(even) { background: #fafafa; }
.totals { width: 300px; margin-left: auto; border-collapse: collapse; }
.totals td { padding: 4px 8px; border: none; font-size: 10.5px; }
.totals td:last-child { text-align: right; font-weight: 600; }
.totals .big td { font-weight: 800; font-size: 15px; border-top: 2px solid #0D9488; padding-top: 6px; color: #0D9488; }
.footer { text-align: center; font-size: 9.5px; color: #9ca3af; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
.status-a4 { text-align: center; margin-top: 8px; font-size: 10px; font-weight: 700; color: #0D9488; letter-spacing: 1px; }
.status-a4.partial { color: #f59e0b; }
</style></head><body>
<div class="header">
  <div class="header-left">
    ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="">` : ""}
    <div>
      <h1>FARAZ PHARMACY</h1>
      <p>Your Trusted Pharmacy &mdash; Quality Care for Everyone</p>
      <div class="addr">Barikot, Swat KPK &bull; Phone: 03469383792</div>
    </div>
  </div>
  <div class="header-right">
    <div class="inv-label">INVOICE</div>
    <div class="inv-id">#${sale.id ? sale.id.slice(0, 8) : "000000"}</div>
  </div>
</div>
<div class="info">
<div><span class="lbl">Invoice:</span> ${sale.id || "N/A"}<br><span class="lbl">Date:</span> ${dateStr}</div>
<div style="text-align:right">
${(sale.customer_name ?? sale.customerName ?? sale.customer?.name) ? `<span class="lbl">Customer:</span> ${sale.customer_name ?? sale.customerName ?? sale.customer?.name}<br>` : ""}
<span class="lbl">Items:</span> ${items.length} (${totalQty} units)
</div>
</div>
<table>
<thead><tr><th style="width:50%">Item</th><th style="width:12%;text-align:center">Qty</th><th style="width:16%;text-align:right">Price</th><th style="width:22%;text-align:right">Total</th></tr></thead>
<tbody>${items.map((i) => {
  const pName = i.product_name ?? i.productName ?? "Item";
  const bNo = i.batch_number ?? i.batchNumber;
  const exp = i.expiry;
  const qty = Number(i.quantity || 1);
  const uPrice = Number(i.unit_price ?? i.unitPrice ?? (qty > 0 ? (i.subtotal || 0) / qty : 0));
  const sub = Number(i.subtotal ?? (uPrice * qty));
  return `<tr><td>${pName}${bNo ? ` <div style="font-size:8.5px;color:#666;">Batch: ${bNo}${exp ? ` | Exp: ${String(exp).slice(0, 7)}` : ""}</div>` : ""}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${uPrice.toFixed(0)}</td><td style="text-align:right">${sub.toFixed(0)}</td></tr>`;
}).join("")}</tbody>
</table>
<table class="totals">
<tr><td>Subtotal</td><td>${Number(sale.subtotal || 0).toFixed(0)}</td></tr>
${sale.discount > 0 ? `<tr><td>Discount</td><td>-${Number(sale.discount).toFixed(0)}</td></tr>` : ""}
${(sale.tax || sale.gst) > 0 ? `<tr><td>Tax / GST</td><td>+${Number(sale.tax || sale.gst).toFixed(0)}</td></tr>` : ""}
<tr class="big"><td>Total</td><td>${Number(sale.total || 0).toFixed(0)}</td></tr>
<tr><td>Paid</td><td>${Number(sale.amount_paid ?? sale.amountPaid ?? 0).toFixed(0)}</td></tr>
<tr><td>Change</td><td>${Math.max(0, Number(sale.amount_paid ?? sale.amountPaid ?? 0) - Number(sale.total || 0)).toFixed(0)}</td></tr>
<tr><td>Arrears</td><td>${Number(sale.customer_total_arrears ?? sale.customerTotalArrears ?? sale.arrears ?? 0).toFixed(0)}</td></tr>
</table>
${sale.status === "partial" ? '<div class="status-a4 partial">PARTIAL PAYMENT</div>' : ""}
<div class="footer"><p>Thank you for your visit! &bull; Powered by Faraz Pharmacy</p></div>
</body></html>`;
}

function generateA5InvoiceHTML(sale) {
  const items = sale.items || [];
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page { size: A5 portrait; margin: 6mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  color: #1a1a1a; background: #fff; font-size: 10.5px; line-height: 1.4;
}
.header {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 10px; border-bottom: 2.5px solid #0D9488; margin-bottom: 12px;
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand-logo { width: 36px; height: 36px; border-radius: 6px; object-fit: contain; }
.brand-name { font-size: 17px; font-weight: 800; color: #0D9488; letter-spacing: -0.3px; }
.brand-sub { font-size: 8.5px; color: #666; margin-top: 1px; }
.brand-addr { font-size: 8px; color: #888; }
.badge { text-align: right; }
.badge h2 { font-size: 18px; font-weight: 800; color: #0D9488; letter-spacing: 1px; }
.badge-id {
  margin-top: 4px; background: #0D9488; color: #fff;
  padding: 4px 10px; border-radius: 3px; font-size: 9px; font-weight: 600; letter-spacing: 0.5px;
}
.info-row {
  display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px;
}
.info-block {
  flex: 1; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 5px;
}
.info-block-title {
  font-size: 7.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase;
  letter-spacing: 0.8px; margin-bottom: 4px;
}
.info-block p { font-size: 10px; margin: 1px 0; color: #333; }
.info-block .label { color: #9ca3af; font-size: 8.5px; }
table.items { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
table.items thead th {
  background: #0D9488; color: #fff; padding: 5px 7px;
  font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
}
table.items thead th:first-child { border-radius: 4px 0 0 0; }
table.items thead th:last-child { border-radius: 0 4px 0 0; }
table.items td { padding: 5px 7px; border-bottom: 1px solid #f0f0f0; font-size: 10px; }
table.items tbody tr:last-child td { border-bottom: none; }
.bottom { display: flex; gap: 12px; margin-top: 4px; }
.notes-block {
  flex: 1; border: 1px solid #e5e7eb; border-radius: 5px; padding: 8px 10px;
  min-height: 70px;
}
.notes-block strong { font-size: 8.5px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
.notes-block p { font-size: 9px; color: #666; margin-top: 4px; line-height: 1.5; }
.totals { width: 200px; }
.totals table { width: 100%; border-collapse: collapse; }
.totals td { padding: 3.5px 6px; font-size: 10px; }
.totals td:last-child { text-align: right; font-weight: 600; }
.totals .total-row td {
  padding: 6px; font-size: 13px; font-weight: 800;
  background: #0D9488; color: #fff; border-radius: 3px;
}
.status-badge {
  margin-top: 8px; text-align: center; padding: 4px;
  border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 1px;
  border: 1.5px solid #0D9488; color: #0D9488;
}
.status-badge.partial { border-color: #f59e0b; color: #f59e0b; background: #fffbeb; }
.divider { border: none; border-top: 1px dashed #d1d5db; margin: 6px 0; }
.footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 8px; color: #9ca3af; }
</style>
</head>
<body>

<div class="header">
  <div class="brand">
    ${logoBase64 ? `<img src="${logoBase64}" class="brand-logo" alt="">` : ""}
    <div>
      <div class="brand-name">FARAZ PHARMACY</div>
      <div class="brand-sub">Quality Care For Everyone</div>
      <div class="brand-addr">Barikot, Swat KPK</div>
    </div>
  </div>
  <div class="badge">
    <h2>INVOICE</h2>
    <div class="badge-id">#${sale.id ? sale.id.slice(0, 8) : "000000"}</div>
  </div>
</div>

<div class="info-row">
  <div class="info-block">
    <div class="info-block-title">Customer</div>
    <p><strong>${sale.customer_name || "Walk-in Customer"}</strong></p>
    <p>${sale.customer_phone || ""}</p>
  </div>
  <div class="info-block">
    <div class="info-block-title">Invoice Details</div>
    <p><span class="label">Date:</span> ${dateStr}</p>
    <p><span class="label">Status:</span> ${sale.status || "Paid"}</p>
    <p><span class="label">Items:</span> ${items.length} (${totalQty} units)</p>
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th style="width:55%">Product</th>
      <th style="width:15%;text-align:center">Qty</th>
      <th style="width:15%;text-align:right">Rate</th>
      <th style="width:15%;text-align:right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${items
      .map((item) => {
        const pName = item.product_name ?? item.productName ?? "Item";
        const bNo = item.batch_number ?? item.batchNumber;
        const exp = item.expiry;
        const qty = Number(item.quantity || 1);
        const unitPrice = Number(item.unit_price ?? item.unitPrice ?? (qty > 0 ? (item.subtotal || 0) / qty : 0));
        const sub = Number(item.subtotal ?? (unitPrice * qty));
        return `<tr>
        <td>
          ${pName}
          ${bNo ? `<div style="font-size:8px;color:#666;">Batch: ${bNo}${exp ? ` | Exp: ${String(exp).slice(0, 7)}` : ""}</div>` : ""}
        </td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">${Math.round(unitPrice)}</td>
        <td style="text-align:right">${sub.toFixed(0)}</td>
      </tr>`;
      })
      .join("")}
  </tbody>
</table>

<hr class="divider">

<div class="bottom">
  <div class="notes-block">
    <strong>Notes</strong>
    <p>Please keep this invoice for returns, replacement or future reference.</p>
    <p>No return without receipt &bull; No return after 3 days &bull; No return of freezer/refrigerator medicines</p>
  </div>
  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td>${Number(sale.subtotal || 0).toFixed(0)}</td></tr>
      ${sale.discount > 0 ? `<tr><td>Discount</td><td>-${Number(sale.discount).toFixed(0)}</td></tr>` : ""}
      ${(sale.tax || sale.gst) > 0 ? `<tr><td>Tax / GST</td><td>+${Number(sale.tax || sale.gst).toFixed(0)}</td></tr>` : ""}
      <tr class="total-row"><td>Total</td><td>${Number(sale.total || 0).toFixed(0)}</td></tr>
      <tr><td>Paid</td><td>${Number(sale.amount_paid ?? sale.amountPaid ?? 0).toFixed(0)}</td></tr>
      <tr><td>Change</td><td>${Math.max(0, Number(sale.amount_paid ?? sale.amountPaid ?? 0) - Number(sale.total || 0)).toFixed(0)}</td></tr>
      <tr><td>Arrears</td><td>${Number(sale.customer_total_arrears ?? sale.customerTotalArrears ?? sale.arrears ?? 0).toFixed(0)}</td></tr>
    </table>
    ${
      sale.status === "partial"
        ? '<div class="status-badge partial">PARTIAL PAYMENT</div>'
        : '<div class="status-badge">PAID</div>'
    }
  </div>
</div>

<div class="footer">Thank you for choosing Faraz Pharmacy &bull; Powered by FarSight System</div>
</body>
</html>`;
}

// return Recipt start

function generateReturnReceiptHTML(returnData, sale) {
  const items = returnData.items || [];

  const now = new Date();

  const dateStr = now.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timeStr = now.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const totalRefund = Number(returnData.refund_amount ?? returnData.refundAmount ?? 0);

  const invoiceNo = sale?.id || returnData.sale_id || returnData.saleId || "N/A";

  const customerName = sale?.customer_name ?? sale?.customerName ?? sale?.customer?.name ?? "Walk-in Customer";

  const itemsHTML = items
    .map((item) => {
      const quantity = Number(item.quantity || 0);

      const refund = Number(item.refund_amount ?? item.refundAmount ?? item.subtotal ?? 0);

      const price = Number(item.price ?? item.unit_price ?? item.unitPrice ?? (quantity > 0 ? refund / quantity : 0));

      const name = item.product_name ?? item.productName ?? "Unknown Item";

      return `
        <tr>
          <td class="item-name">
            ${name}
            ${item.reason ? `<div class="item-reason">${item.reason}</div>` : ""}
          </td>

          <td class="qty">
            ${quantity}
          </td>

          <td class="price">
            ${price.toFixed(0)}
          </td>

          <td class="refund">
            ${refund.toFixed(0)}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<style>

@page {
  size: 75mm auto;
  margin: 0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  width: 70mm;
  margin: 5;
  padding: 5;
}

body {
  font-family:Arial,sans-serif;
  font-size: 12px;
  color: #000;
  background: #fff;
   width: 70mm;
  margin: 5;
  padding: 5;
}

.receipt {
  width: 70mm;
  margin: 0 auto;
}

/* =========================================
   HEADER
========================================= */

.header {
  text-align: center;
  margin-bottom: 5px;
}

.pharmacy-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.1;
}

.address {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.3;
}

.contact {
  font-size: 11px;
  margin-top: 1px;
}

/* =========================================
   RETURN RECEIPT TITLE
========================================= */

.return-title {
  text-align: center;
  margin-top: 5px;
  margin-bottom: 5px;
}

.return-title-text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}

.return-title-line {
  width: 40px;
  margin: 3px auto 0;
  border-top: 2px solid #000;
}

/* =========================================
   INFO
========================================= */

.info {
  width: 100%;
  margin-top: 5px;
  margin-bottom: 5px;
  line-height: 1.0;
  font-weight: 650;
   font-size: 11px;
}

.info-row {

  align-items: center;
  font-size: 10px;
  line-height: 1.7;
}

.info-label {
  font-weight: 700;
}

.info-value {
  text-align: leftt;
  max-width: 48%;
  word-break: break-word;
}

/* =========================================
   DOTTED LINE
========================================= */

.dotted {
  width: 100%;
  border-top: 1px dashed #000;
  height: 1px;
  margin: 5px 0;
}

/* =========================================
   ITEMS TABLE
========================================= */

.items {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.items th {
  font-size: 11px;
  font-weight: 700;

  padding: 3px 1px;
  white-space: nowrap;
}

.items th:nth-child(1) {
  width: 42%;
  text-align: left;
}

.items th:nth-child(2) {
  width: 12%;
  text-align: center;
}

.items th:nth-child(3) {
  width: 21%;
  text-align: right;
}

.items th:nth-child(4) {
  width: 25%;
  text-align: right;
}

.items td {
  font-size: 12px;
  padding: 4px 2px;
  vertical-align: top;
}

.item-name {
  text-align: left;
  font-weight: 500;
  line-height: 1.2;
  font-size: 10px;
  word-break: break-word;
}

.item-reason {
  font-size: 10px;
  color: #555;
  margin-top: 1px;
}

.qty {
  text-align: center;
}

.price {
  text-align: center;
}

.refund {
  text-align: center;
  font-weight: 600;
}

/* =========================================
   TOTAL
========================================= */

.total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  margin: 5px;
  font-weight: 700;
}

.total-label {
  font-size: 10px;
}

.total-value {
  font-size: 12px;
  font-weight: 700;
}

/* =========================================
   REASON
========================================= */

.reason {
  font-size: 8px;
  margin-top: 2px;
  line-height: 1.3;
}

.reason-label {
  font-weight: 700;
}

/* =========================================
   FOOTER
========================================= */

.footer {
  text-align: center;
  margin-top: 6px;
}

.footer-message {
  font-size: 9px;
  font-weight: 600;
}

.footer-line {
  margin: 3px 0;
  border-top: 1px dashed #000;
}

.footer-developed {
  font-size: 8px;
}

.footer-website {
  font-weight: 700;
}

/* =========================================
   PRINT
========================================= */

@media print {

  html,
  body {
    width: 70mm;
  }

  .receipt {
    width: 70mm;
  }

}

</style>

</head>

<body>

<div class="receipt">

  <!-- =====================================
       HEADER
  ====================================== -->

  <div class="header">

    <div class="pharmacy-name">
      FARAZ PHARMACY
    </div>

    <div class="address">
     Beside Numan Clinical Laboratory Barikot, Swat
    </div>

    <div class="contact">
      Phone: 0346-9383792  |  0344-9006940
    </div>

  </div>


  <!-- =====================================
       RETURN RECEIPT
  ====================================== -->

  <div class="return-title">

    <div class="return-title-text">
      RETURN RECEIPT
    </div>

    <div class="return-title-line"></div>

  </div>


  <!-- =====================================
       INVOICE INFORMATION
  ====================================== -->

  <div class="info">

    <div class="info-row">
      <div>
        Refund No : ${invoiceNo} 
      </div>
      <div>
        Date :  ${dateStr},  ${timeStr}
      </div>
         <div>
        Customer :  ${customerName}
      </div>
    </div>
  </div>


  <!-- DOTTED LINE -->

  <div class="dotted"></div>


  <!-- =====================================
       TABLE HEADER
  ====================================== -->

  <table class="items">

    <thead>
      <tr>
        <th>
          Returned Item
        </th>
        <th>
          Qty
        </th>
        <th>
          Price
        </th>
        <th>
          Refund
        </th>

      </tr>

    </thead>

  </table>


  <!-- DOTTED LINE -->

  <div class="dotted"></div>


  <!-- =====================================
       RETURN ITEMS
  ====================================== -->

  <table class="items">

    <tbody>

      ${itemsHTML}

    </tbody>

  </table>


  <!-- DOTTED LINE -->

  <div class="dotted"></div>


  <!-- =====================================
       TOTAL REFUND
  ====================================== -->

  <div class="total">

    <span class="total-label">
      Total Refund :
    </span>

    <span class="total-value">
      Rs ${totalRefund.toFixed(0)}
    </span>

  </div>


  <!-- RETURN REASON -->

  ${
    returnData.reason
      ? `
        <div class="reason">
          <span class="reason-label">
            Reason:
          </span>
          ${returnData.reason}
        </div>
      `
      : ""
  }


  <!-- =====================================
       FOOTER
  ====================================== -->

  <div class="footer">

    <div class="footer-line"></div>

    <div class="footer-developed">
      Developed by
      <span class="footer-website">
        www.farsightsystem.com
      </span>
    </div>

    <div class="footer-line"></div>

  </div>


</div>

</body>
</html>
`;
}

// function generateReturnReceiptHTML(returnData, sale, paperSize) {
//   const items = returnData.items || [];
//   const now = new Date();

//   const dateStr = now.toLocaleDateString("en-PK", {
//     day: "2-digit",
//     month: "short",
//     year: "numeric",
//   });

//   const timeStr = now.toLocaleTimeString("en-PK", {
//     hour: "2-digit",
//     minute: "2-digit",
//     hour12: true,
//   });

//   const isThermal = paperSize === "thermal";

//   const pageCSS = isThermal
//     ? `
//       @page {
//         size: 80mm auto;
//         margin: 0;
//       }
//     `
//     : `
//       @page {
//         size: A5 portrait;
//         margin: 7mm;
//       }
//     `;

//   const itemsHTML = items
//     .map((item) => {
//       const amount = Number(
//         item.refund_amount ?? item.subtotal ?? 0
//       );

//       return `
//         <tr>
//           <td class="item">
//             <div class="item-name">
//               ${item.product_name}
//             </div>

//             <div class="item-details">
//               ${item.quantity} × returned
//               ${
//                 item.reason
//                   ? ` • ${item.reason}`
//                   : ""
//               }
//             </div>
//           </td>

//           <td class="price">
//             ${amount.toFixed(0)}
//           </td>
//         </tr>
//       `;
//     })
//     .join("");

//   const refundAmount = Number(
//     returnData.refund_amount || 0
//   );

//   return `
// <!DOCTYPE html>

// <html>

// <head>

// <meta charset="UTF-8">

// <style>

// ${pageCSS}

// /* =====================================================
//    RESET
// ===================================================== */

// * {
//   margin: 0;
//   padding: 0;
//   box-sizing: border-box;
// }

// html,
// body {
//   width:70mm;
//     margin:5;
//     padding:5;
//     font-family:Arial,sans-serif;
// }

// body {
//   background: #fff;
//   color: #111;
//   width:70mm;
//     margin:5;
//     padding:5;
//     font-family:Arial,sans-serif;
// }

// /* =====================================================
//    MAIN
// ===================================================== */

// .receipt {
//   width: 100%;
//   margin: auto;
// }

// /* =====================================================
//    HEADER
// ===================================================== */

// .header {
//   text-align: center;
//   padding-bottom: 10px;
//   border-bottom: 2px solid #111;
// }

// .logo {
//   width: ${isThermal ? "55px" : "65px"};
//   height: ${isThermal ? "55px" : "65px"};
//   object-fit: contain;
//   margin-bottom: 5px;
// }

// .pharmacy-name {
//   font-size: ${isThermal ? "21px" : "27px"};
//   font-weight: 800;
//   letter-spacing: 1.5px;
// }

// .pharmacy-sub {
//   margin-top: 3px;
//   font-size: ${isThermal ? "9px" : "10px"};
//   color: #666;
//   letter-spacing: .4px;
// }

// /* =====================================================
//    RETURN TITLE
// ===================================================== */

// .return-header {
//   text-align: center;
//   padding: ${isThermal ? "9px 0" : "13px 0"};
// }

// .return-title {
//   font-size: ${isThermal ? "14px" : "17px"};
//   font-weight: 800;
//   letter-spacing: 1.8px;
// }

// .return-line {
//   width: ${isThermal ? "45px" : "60px"};
//   height: 2px;
//   background: #111;
//   margin: 5px auto;
// }

// .return-subtitle {
//   font-size: ${isThermal ? "9px" : "10px"};
//   color: #777;
// }

// /* =====================================================
//    META
// ===================================================== */

// .meta {
//   display: flex;
//   justify-content: space-between;
//   align-items: flex-start;

//   padding: ${isThermal ? "6px 0" : "8px 0"};

//   border-top: 1px solid #ddd;
//   border-bottom: 1px solid #ddd;
// }

// .meta-block {
//   width: 50%;
// }

// .meta-block:last-child {
//   text-align: right;
// }

// .meta-label {
//   font-size: ${isThermal ? "8px" : "9px"};
//   color: #777;
//   text-transform: uppercase;
//   letter-spacing: .7px;
//   margin-bottom: 3px;
// }

// .meta-value {
//   font-size: ${isThermal ? "10px" : "11px"};
//   font-weight: 600;
// }

// /* =====================================================
//    ITEMS
// ===================================================== */

// .items {
//   width: 100%;
//   border-collapse: collapse;
//   margin-top: ${isThermal ? "9px" : "13px"};
// }

// .items thead th {
//   padding-bottom: 5px;

//   font-size: ${isThermal ? "8px" : "9px"};
//   text-transform: uppercase;
//   letter-spacing: .8px;

//   color: #666;

//   border-bottom: 1px solid #111;
// }

// .items thead th:first-child {
//   text-align: left;
// }

// .items thead th:last-child {
//   text-align: right;
// }

// .items tbody tr {
//   border-bottom: 1px solid #eee;
// }

// .items td {
//   padding: ${isThermal ? "6px 0" : "8px 0"};
//   vertical-align: top;
// }

// .item {
//   width: 75%;
// }

// .item-name {
//   font-size: ${isThermal ? "10px" : "11px"};
//   font-weight: 600;
//   line-height: 1.3;
// }

// .item-details {
//   margin-top: 2px;
//   color: #777;
//   font-size: ${isThermal ? "8px" : "9px"};
// }

// .price {
//   width: 25%;
//   text-align: right;
//   font-size: ${isThermal ? "10px" : "11px"};
//   font-weight: 600;
//   white-space: nowrap;
// }

// /* =====================================================
//    REFUND AREA
// ===================================================== */

// .refund-section {
//   margin-top: ${isThermal ? "10px" : "14px"};
//   border-top: 2px solid #111;
//   border-bottom: 2px solid #111;

//   padding: ${isThermal ? "8px 0" : "11px 0"};

//   display: flex;
//   justify-content: space-between;
//   align-items: center;
// }

// .refund-label {
//   font-size: ${isThermal ? "9px" : "10px"};
//   text-transform: uppercase;
//   letter-spacing: 1px;
//   font-weight: 700;
// }

// .refund-value {
//   font-size: ${isThermal ? "19px" : "23px"};
//   font-weight: 800;
// }

// /* =====================================================
//    REASON
// ===================================================== */

// .reason {
//   margin-top: ${isThermal ? "8px" : "11px"};
// }

// .reason-label {
//   font-size: ${isThermal ? "8px" : "9px"};
//   color: #777;
//   text-transform: uppercase;
//   letter-spacing: .7px;
// }

// .reason-text {
//   margin-top: 3px;
//   font-size: ${isThermal ? "9px" : "10px"};
// }

// /* =====================================================
//    STATUS
// ===================================================== */

// .status {
//   text-align: center;

//   margin-top: ${isThermal ? "11px" : "16px"};

//   font-size: ${isThermal ? "9px" : "10px"};
//   font-weight: 700;
//   letter-spacing: .5px;
// }

// /* =====================================================
//    FOOTER
// ===================================================== */

// .footer {
//   margin-top: ${isThermal ? "10px" : "17px"};

//   padding-top: ${isThermal ? "7px" : "9px"};

//   border-top: 1px solid #ddd;

//   text-align: center;
// }

// .footer-main {
//   font-size: ${isThermal ? "9px" : "10px"};
//   font-weight: 600;
// }

// .footer-sub {
//   margin-top: 3px;
//   font-size: ${isThermal ? "8px" : "9px"};
//   color: #888;
// }

// /* =====================================================
//    THERMAL
// ===================================================== */

// ${isThermal ? `
// body {
//   width: 70mm;
//   padding: 5mm 4mm;
// }

// .receipt {
//   max-width: 72mm;
// }
// ` : `
// body {
//   padding: 0;
//    max-width: 65mm;
// }

// .receipt {
//   max-width: 140mm;
// }
// `}

// </style>

// </head>

// <body>

// <div class="receipt">

//   <!-- ================================================
//        HEADER
//   ================================================= -->

//   <div class="header">

//     ${
//       sale?.logoBase64
//         ? `
//         <img
//           src="${sale.logoBase64}"
//           class="logo"
//         />
//         `
//         : ""
//     }

//     <div class="pharmacy-name">
//       FARAZ PHARMACY
//     </div>

//     <div class="pharmacy-sub">
//       Quality Care For Everyone
//     </div>

//   </div>

//   <!-- ================================================
//        RETURN TITLE
//   ================================================= -->

//   <div class="return-header">

//     <div class="return-title">
//       RETURN RECEIPT
//     </div>

//     <div class="return-line"></div>

//     <div class="return-subtitle">
//       Merchandise Return & Refund
//     </div>

//   </div>

//   <!-- ================================================
//        META INFORMATION
//   ================================================= -->

//   <div class="meta">

//     <div class="meta-block">

//       <div class="meta-label">
//         Original Sale
//       </div>

//       <div class="meta-value">
//         #${sale?.id ? sale.id.slice(0, 10) : "N/A"}
//       </div>

//     </div>

//     <div class="meta-block">

//       <div class="meta-label">
//         Return Date
//       </div>

//       <div class="meta-value">
//         ${dateStr}<br>
//         ${timeStr}
//       </div>

//     </div>

//   </div>

//   <!-- ================================================
//        ITEMS
//   ================================================= -->

//   <table class="items">

//     <thead>

//       <tr>

//         <th>
//           Returned Item
//         </th>

//         <th>
//           Refund
//         </th>

//       </tr>

//     </thead>

//     <tbody>

//       ${itemsHTML}

//     </tbody>

//   </table>

//   <!-- ================================================
//        REFUND TOTAL
//   ================================================= -->

//   <div class="refund-section">

//     <div class="refund-label">
//       Total Refund
//     </div>

//     <div class="refund-value">
//       Rs ${refundAmount.toFixed(0)}
//     </div>

//   </div>

//   <!-- ================================================
//        REASON
//   ================================================= -->

//   ${
//     returnData.reason
//       ? `
//       <div class="reason">

//         <div class="reason-label">
//           Return Reason
//         </div>

//         <div class="reason-text">
//           ${returnData.reason}
//         </div>

//       </div>
//       `
//       : ""
//   }

//   <!-- ================================================
//        STATUS
//   ================================================= -->

//   <div class="status">
//     RETURN PROCESSED SUCCESSFULLY
//   </div>

//   <!-- ================================================
//        FOOTER
//   ================================================= -->

//   <div class="footer">

//     <div class="footer-main">
//       Thank you for choosing Faraz Pharmacy
//     </div>

//     <div class="footer-sub">
//       Powered by Faraz Pharmacy POS
//     </div>

//   </div>

// </div>

// </body>
// </html>
// `;
// }

// function generateReturnReceiptHTML(returnData, sale, paperSize) {
//   const items = returnData.items || [];
//   const now = new Date();
//   const dateStr = now.toLocaleDateString("en-PK", {
//     day: "numeric",
//     month: "short",
//     year: "numeric",
//     hour: "2-digit",
//     minute: "2-digit",
//   });

//   const isThermal = paperSize === "thermal";
//   const pageCSS = isThermal
//     ? "@page { margin: 0; size: 80mm 297mm; }"
//     : "@page { margin: 5mm; size: A5; }";

//   const baseStyle = isThermal
//     ? `body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 4mm 3mm; line-height: 1.3; } .receipt { width: 100%; }`
//     : `body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #000; }`;

//   const itemsHTML = items
//     .map((i) => {
//       const reasonStr = i.reason ? ` (${i.reason})` : "";
//       const amt = i.refund_amount ?? i.subtotal ?? 0;
//       return `<tr><td>${i.product_name} × ${i.quantity}${reasonStr}</td><td style="text-align:right">${amt.toFixed(0)}</td></tr>`;
//     })
//     .join("");

//   return `<!DOCTYPE html>
// <html><head><meta charset="utf-8">
// <style>
// ${pageCSS}
// * { margin: 0; padding: 0; box-sizing: border-box; }
// ${isThermal ? "html, body { height: 100%; }" : ""}
// ${baseStyle}
// h1 { text-align: center; margin-bottom: 4px; font-size: ${isThermal ? "20px" : "20px"}; letter-spacing: 1px; font-weight: 800; }
// .sub { text-align: center; font-size: ${isThermal ? "10px" : "11px"}; margin-bottom: 6px; color: #333; font-weight: 600; }
// .badge { text-align: center; font-size: ${isThermal ? "13px" : "14px"}; font-weight: 800; color: #c00; margin: 6px 0; letter-spacing: 1px; }
// hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
// hr.dashed { border-top: 1px dashed #888; }
// table { width: 100%; border-collapse: collapse; table-layout: fixed; }
// th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding: 3px 0; font-weight: 700; }
// td { font-size: ${isThermal ? "11px" : "13px"}; padding: 2px 0; font-weight: 600; }
// td:last-child { text-align: right; }
// .big td { font-weight: 800; font-size: ${isThermal ? "13px" : "15px"}; padding-top: 4px; border-top: 1px solid #000; }
// .ftr { text-align: center; font-size: ${isThermal ? "10px" : "11px"}; margin-top: 6px; color: #555; font-weight: 600; }
// </style></head><body>
// <div class="receipt">
// <h1>FARAZ PHARMACY</h1>
// <p class="sub">${dateStr}</p>
// <p class="badge">** RETURN RECEIPT **</p>
// <p class="sub">Sale: ${sale?.id || "N/A"}</p>
// <hr>
// <table>
// <thead><tr><th>Item</th><th style="text-align:right">Refund</th></tr></thead>
// <tbody>${itemsHTML}</tbody>
// </table>
// <hr class="dashed">
// <table>
// <tr class="big"><td>Total Refund</td><td style="text-align:right">${returnData.refund_amount.toFixed(0)}</td></tr>
// </table>
// <p class="sub" style="margin-top:6px">Reason: ${returnData.reason}</p>
// <hr>
// <p class="ftr">Return processed successfully</p>
// <p class="ftr">--- Powered by Faraz Pharmacy ---</p>
// </div>
// </body></html>`;
// }

// return Recipt end

function getPrintOptions(printerConfig) {
  const paperSize = printerConfig?.paperSize || "thermal";
  const opts = {
    silent: true,
    printBackground: true,
    deviceName: printerConfig?.deviceName || undefined,
  };

  const margins = printerConfig?.margins;

  if (paperSize === "thermal") {
    opts.pageSize = { width: 80000, height: 297000 };
    opts.margins = { marginType: "none" };
  } else if (paperSize === "a4") {
    opts.pageSize = "A4";
    if (margins) {
      opts.margins = {
        marginType: "custom",
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
      };
    } else {
      opts.margins = { marginType: "printableArea" };
    }
  } else if (paperSize === "a5") {
    opts.pageSize = "A5";
    if (margins) {
      opts.margins = {
        marginType: "custom",
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
      };
    } else {
      opts.margins = { marginType: "printableArea" };
    }
  }

  return opts;
}

function escposInit() {
  return Buffer.from([0x1b, 0x40]);
}

function escposAlign(n) {
  return Buffer.from([0x1b, 0x61, n]);
}

function escposBold(n) {
  return Buffer.from([0x1b, 0x45, n]);
}

function escposCut(full) {
  return Buffer.from([0x1d, 0x56, full ? 0x00 : 0x01]);
}

function escposText(str) {
  const safe = String(str).replace(/[^\x00-\xFF]/g, "");
  return Buffer.from(safe + "\r\n", "latin1");
}

function escposTextUTF8(str) {
  const safe = String(str).replace(/[^\x00-\xFF]/g, "");
  return Buffer.from(safe + "\r\n", "utf8");
}

function escposCodePage(n) {
  return Buffer.from([0x1b, 0x74, n]);
}

function escposFont(n) {
  return Buffer.from([0x1b, 0x4d, n]);
}

function escposCharSize(h, w) {
  return Buffer.from([0x1d, 0x21, (h << 4) | w]);
}

function escposLine(char, len) {
  return Buffer.from(char.repeat(len) + "\r\n", "latin1");
}

function escposFeed(n) {
  return Buffer.from("\r\n".repeat(n), "latin1");
}

function generateESCPOSReceipt(sale) {
  const items = sale.items || [];
  const now = new Date();
  const totalAmount = sale.total || 0;
  const subtotal = sale.subtotal || 0;
  const paidAmount = sale.amount_paid || 0;
  const changeDue = sale.change || 0;
  const discount = sale.discount || 0;
  const tax = sale.tax || sale.gst || 0;
  const balance = Math.max(0, totalAmount - paidAmount);
  const L = 48;
  const parts = [];

  parts.push(escposInit());
  parts.push(escposCodePage(2));
  parts.push(escposAlign(1));
  parts.push(escposBold(1));
  parts.push(escposCharSize(1, 0));
  parts.push(escposText("Faraz Medical Store"));
  parts.push(escposCharSize(0, 0));
  parts.push(escposBold(0));
  parts.push(escposText("Beside Noman Clinical Laboratory"));
  parts.push(escposText("Barikot, Swat"));
  parts.push(escposLine("=", L));
  parts.push(escposAlign(0));

  const dateStr = now.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  parts.push(escposText("Date:      " + dateStr));
  parts.push(escposText("Invoice:   " + (sale.id || "")));
  parts.push(escposText("Customer:  " + (sale.customer_name || "Walk-in Customer")));
  parts.push(escposLine("-", L));

  const colName = 22;
  const colQty = 4;
  const colUnit = 7;
  const colAmt = 10;
  const colPad = colName + colQty + colUnit;
  parts.push(
    escposText(
      "Item".padEnd(colName) +
        "Qty".padStart(colQty) +
        "Rate".padStart(colUnit) +
        "Amt".padStart(colAmt)
    )
  );
  parts.push(escposLine("-", L));

  items.forEach((item) => {
    const name = (item.product_name || "").padEnd(colName).slice(0, colName);
    const qty = String(item.quantity).padStart(colQty);
    const unitPrice = String(Math.round(item.subtotal / item.quantity)).padStart(colUnit);
    const amount = String(item.subtotal.toFixed(0)).padStart(colAmt);
    parts.push(escposText(name + qty + unitPrice + amount));
    if (item.batch_number) {
      const bInfo = `  B:${item.batch_number}${item.expiry ? ` Exp:${item.expiry.slice(0, 7)}` : ""}`;
      parts.push(escposText(bInfo.padEnd(L).slice(0, L)));
    }
  });

  parts.push(escposLine("-", L));

  function addLine(label, valueStr, isBold) {
    const line = label.padEnd(colPad) + valueStr.padStart(colAmt);
    if (isBold) parts.push(escposBold(1));
    parts.push(escposText(line));
    if (isBold) parts.push(escposBold(0));
  }

  addLine("Subtotal", (subtotal || totalAmount).toFixed(0));
  if (discount > 0) addLine("Discount", "-" + discount.toFixed(0));
  if (tax > 0) addLine("Tax / GST", "+" + tax.toFixed(0));
  addLine("Total", totalAmount.toFixed(0), true);
  addLine("Paid", paidAmount.toFixed(0));
  if (balance > 0) addLine("Balance", balance.toFixed(0));
  else if (changeDue > 0) addLine("Change", changeDue.toFixed(0));
  parts.push(escposLine("=", L));

  if (sale.status === "partial") {
    parts.push(escposAlign(1));
    parts.push(escposBold(1));
    parts.push(escposText("** PARTIAL PAYMENT **"));
    parts.push(escposBold(0));
    parts.push(escposAlign(0));
  }

  parts.push(escposAlign(1));
  parts.push(escposFeed(1));
  parts.push(escposText("Thank You For Your Visit!"));
  parts.push(escposFeed(3));
  parts.push(escposCut(true));

  return Buffer.concat(parts);
}

function generateESCPOSReturnReceipt(returnData, sale) {
  const items = returnData.items || [];
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const L = 56;
  const parts = [];

  parts.push(escposInit());
  parts.push(escposFont(1));
  parts.push(escposAlign(1));
  parts.push(escposBold(1));
  parts.push(escposCharSize(1, 0));
  parts.push(escposText("FARAZ PHARMACY"));
  parts.push(escposCharSize(0, 0));
  parts.push(escposBold(0));
  parts.push(escposText(dateStr));
  parts.push(escposLine("=", L));
  parts.push(escposBold(1));
  parts.push(escposText("** RETURN RECEIPT **"));
  parts.push(escposBold(0));
  parts.push(escposText("Sale: " + (sale?.id || "N/A")));
  parts.push(escposLine("-", L));
  parts.push(escposAlign(0));
  const colName = 44;
  const colAmt = 12;
  parts.push(escposText("Item description".padEnd(colName) + "Refund".padStart(colAmt)));
  parts.push(escposLine("-", L));

  items.forEach((i) => {
    const reasonStr = i.reason ? " (" + i.reason + ")" : "";
    const pName = i.product_name ?? i.productName ?? "Item";
    const name = (pName + " x" + i.quantity + reasonStr).padEnd(colName).slice(0, colName);
    const refundVal = Number(i.refund_amount ?? i.refundAmount ?? i.subtotal ?? 0);
    const amt = String(refundVal.toFixed(0)).padStart(colAmt);
    parts.push(escposText(name + amt));
  });

  parts.push(escposLine("-", L));
  parts.push(escposBold(1));
  const totalLabel = "Total Refund".padEnd(colName);
  const totalRefund = Number(returnData.refund_amount ?? returnData.refundAmount ?? 0);
  const totalVal = totalRefund.toFixed(0).padStart(colAmt);
  parts.push(escposText(totalLabel + totalVal));
  parts.push(escposBold(0));
  parts.push(escposText("Reason: " + (returnData.reason || "N/A")));
  parts.push(escposLine("=", L));
  parts.push(escposAlign(1));
  parts.push(escposText("Return processed successfully"));
  parts.push(escposFeed(3));
  parts.push(escposCut(true));

  return Buffer.concat(parts);
}

function generateBarcodeLabelHTML(
  barcode,
  svgHtml,
  copies,
  productName,
  labelWidth = 30,
  labelHeight = 20
) {
  const count = Math.max(1, parseInt(copies, 10) || 1);
  const w = Number(labelWidth) || 30;
  const h = Number(labelHeight) || 20;

  const escapeHtml = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const safeProductName = escapeHtml(productName);
  const productNameHtml = safeProductName
    ? `<div class="product-name">${safeProductName}</div>`
    : "";

  const isSmall = h <= 22;
  const isNarrow = w <= 30;
  const bcHeight = isSmall ? 24 : 32;
  const bcFontSize = isNarrow ? 8.5 : isSmall ? 9 : 11;
  const bcWidth = isNarrow ? 1.0 : isSmall ? 1.1 : 1.25;

  let body;
  if (jsBarcodeSource) {
    const valuesJson = JSON.stringify(Array(count).fill(String(barcode))).replace(/</g, "\\u003c");
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push(
        `<div class="label"><div class="barcode-container">${productNameHtml}<svg class="bc"></svg></div></div>`
      );
    }
    body = `${labels.join("")}
<script>
try {
  var values = ${valuesJson};
  function renderBarcode(svg, value) {
    try {
      JsBarcode(svg, value, { format: "EAN13", width: ${bcWidth}, height: ${bcHeight}, displayValue: true, fontSize: ${bcFontSize}, textMargin: 1, margin: 0 });
    } catch (e) {
      JsBarcode(svg, value, { format: "CODE128", width: ${bcWidth}, height: ${bcHeight}, displayValue: true, fontSize: ${bcFontSize}, textMargin: 1, margin: 0 });
    }
  }
  var svgs = document.querySelectorAll("svg.bc");
  for (var i = 0; i < svgs.length; i++) renderBarcode(svgs[i], values[i]);
} catch (e) {}
</script>`;
  } else if (svgHtml) {
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push(
        `<div class="label"><div class="barcode-container">${productNameHtml}<div class="barcode">${svgHtml}</div></div></div>`
      );
    }
    body = labels.join("");
  } else {
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push(
        `<div class="label"><div class="barcode-container">${productNameHtml}<div class="code">${escapeHtml(barcode)}</div></div></div>`
      );
    }
    body = labels.join("");
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><script>${jsBarcodeSource}</script><style>
@page {
  size: ${w}mm ${h}mm;
  margin: 0;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.label {
  position: relative;
  width: ${w}mm;
  height: ${h}mm;
  max-height: ${h}mm;
  overflow: hidden;
  page-break-inside: avoid;
  break-inside: avoid;
  page-break-after: always;
  break-after: page;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.label:last-child {
  page-break-after: auto;
  break-after: auto;
}
  .label .barcode-container {
    width: 98%;
    height: 96%;
    max-height: 96%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    box-sizing: border-box;
    padding: 0.2mm 0 0.1mm 0;
    gap: 0.1mm;
  }
  .label .product-name {
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${isNarrow ? "1.75mm" : isSmall ? "1.9mm" : "2.35mm"};
    line-height: 1.06;
    font-weight: bold;
    text-align: center;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    width: 100%;
    color: #000;
    margin: 0;
    flex-shrink: 0;
  }
  .label svg.bc {
    width: 98%;
    height: auto;
    max-height: ${isNarrow ? "14mm" : isSmall ? "13mm" : "18mm"};
    display: block;
    margin-top: 0;
  }
  .label .barcode {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 98%;
    height: auto;
    max-height: ${isNarrow ? "14mm" : isSmall ? "13mm" : "18mm"};
    overflow: hidden;
  }
  .label .barcode svg {
    width: 100%;
    height: auto;
    max-height: 100%;
  }
.label .code {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 3mm;
  letter-spacing: 1px;
  text-align: center;
  white-space: nowrap;
}
</style></head><body>${body}</body></html>`;
}

function doBarcodePrintJob(html, deviceName, labelWidth, labelHeight) {
  const widthMicrons = Math.round((Number(labelWidth) || 30) * 1000);
  const heightMicrons = Math.round((Number(labelHeight) || 20) * 1000);

  return new Promise((resolve, reject) => {
    const filePath = writeTempFile(html, "html");

    const printWin = new BrowserWindow({
      width: 500,
      height: 500,
      show: false,
      paintWhenReady: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
    });

    let resolved = false;

    function cleanup() {
      resolved = true;
      try {
        printWin.close();
      } catch (_) {}
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }

    function printWithOptions(options) {
      return new Promise((resolvePrint, rejectPrint) => {
        try {
          printWin.webContents.print(options, (success, failureReason) => {
            if (success) return resolvePrint();
            rejectPrint(new Error(failureReason || "Print failed or cancelled"));
          });
        } catch (e) {
          rejectPrint(e);
        }
      });
    }

    function doPrint() {
      if (resolved) return;
      const baseOptions = {
        silent: true,
        printBackground: true,
        deviceName: deviceName || undefined,
        margins: { marginType: "none" },
      };
      const customSizeOptions = {
        ...baseOptions,
        pageSize: { width: widthMicrons, height: heightMicrons },
      };

      (async () => {
        try {
          await printWithOptions(customSizeOptions);
        } catch {
          if (resolved) return;
          await printWithOptions(baseOptions);
        }
      })()
        .then(() => {
          if (resolved) return;
          cleanup();
          resolve();
        })
        .catch((e) => {
          if (resolved) return;
          cleanup();
          reject(e);
        });
    }

    printWin.webContents.on("did-finish-load", () => {
      setTimeout(doPrint, 150);
    });
    printWin.webContents.on("did-fail-load", (_, code, desc) => {
      if (resolved) return;
      cleanup();
      reject(new Error(`Failed to load barcode label: ${desc} (${code})`));
    });

    printWin.loadURL(`file://${filePath.replace(/\\/g, "/")}`);

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("Barcode print timeout"));
      }
    }, 20000);
  });
}

async function printBarcodeLabel(
  barcode,
  copies,
  svgHtml,
  labelWidth,
  labelHeight,
  deviceName,
  productName
) {
  const width = Number(labelWidth) || 30;
  const height = Number(labelHeight) || 20;
  const html = generateBarcodeLabelHTML(barcode, svgHtml, copies || 1, productName, width, height);
  await doBarcodePrintJob(html, deviceName, width, height);
}

function generateHTML(sale, paperSize) {
  if (paperSize === "a4") return generateA4InvoiceHTML(sale);
  if (paperSize === "a5") return generateA5InvoiceHTML(sale);
  return generateSaleReceiptHTML(sale);
}

function writeTempFile(content, ext) {
  const tmpDir = app.getPath("temp");
  const filePath = path.join(tmpDir, `faraz-receipt-${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function doPrintJob(data, printerConfig) {
  const paperSize = printerConfig?.paperSize || "thermal";

  return new Promise((resolve, reject) => {
    const filePath = writeTempFile(data, "html");

    const printWin = new BrowserWindow({
      width: paperSize === "a4" ? 800 : paperSize === "thermal" ? 350 : 600,
      height: 600,
      show: false,
      paintWhenReady: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
    });

    let resolved = false;

    function cleanup() {
      resolved = true;
      try {
        printWin.close();
      } catch (_) {}
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }

    function doPrint() {
      if (resolved) return;
      try {
        printWin.webContents.print(getPrintOptions(printerConfig), (success) => {
          if (resolved) return;
          if (!success) {
            cleanup();
            return reject(new Error("Print failed or cancelled"));
          }
          cleanup();
          resolve();
        });
      } catch (e) {
        cleanup();
        reject(e);
      }
    }

    printWin.webContents.on("did-finish-load", doPrint);
    printWin.webContents.on("did-fail-load", (_, code, desc) => {
      if (resolved) return;
      cleanup();
      reject(new Error(`Failed to load receipt: ${desc} (${code})`));
    });

    printWin.loadURL(`file://${filePath.replace(/\\/g, "/")}`);

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("Print timeout"));
      }
    }, 15000);
  });
}

function printReceipt(sale, printerConfig) {
  const paperSize = printerConfig?.paperSize || "thermal";
  console.log(
    `printReceipt: paperSize=${paperSize} items=${(sale.items || []).length} total=${sale.total}`
  );
  const html = generateHTML(sale, paperSize);
  console.log(`printReceipt: generated HTML length=${html.length}`);
  return doPrintJob(html, printerConfig);
}

function printReturnReceipt(returnData, sale, printerConfig) {
  const paperSize = printerConfig?.paperSize || "thermal";
  const html = generateReturnReceiptHTML(returnData, sale, paperSize);
  return doPrintJob(html, printerConfig);
}

export {
  printReceipt,
  printReturnReceipt,
  printBarcodeLabel,
  generateHTML,
  generateReturnReceiptHTML,
};
