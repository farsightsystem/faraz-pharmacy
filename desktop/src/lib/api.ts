import type {
  PaginatedResponse,
  Product,
  ProductInput,
  Customer,
  CustomerInput,
  Sale,
  SaleInput,
  Arrear,
  ArrearInput,
  StockPurchase,
  StockInput,
  Distributor,
  DistributorInput,
  Company,
  CompanyInput,
  CompanyDetail,
  CompanyReport,
  ReturnEntry,
  ReturnInput,
  Expense,
  ExpenseInput,
  Category,
  CategoryInput,
  DashboardStats,
  BarcodeEntry,
  CustomerArrearSummary,
  CustomerLedgerDetail,
  CustomerPaymentReceipt,
  ProductBatch,
  ProductReportData,
} from "@/types";
import type { BackupResult, BackupEntry, GDriveConfig, AutoBackupConfig } from "@/types/electron";

function getApiUrl(): string {
  const cfg = window.appConfig?.serverUrl?.trim();
  if (cfg) return cfg;
  return import.meta.env.VITE_API_URL?.trim() || "http://localhost:3001";
}

function getToken(): string | null {
  return localStorage.getItem("faraz_access_token");
}

async function fetchJson<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

const api = {
  auth: {
    login: (
      username: string,
      password: string
    ): Promise<{
      accessToken: string;
      refreshToken: string;
      csrfToken: string;
      user: { id: string; username: string; role: string };
    }> => fetchJson("POST", "/api/auth/login", { username, password }, false),
    refresh: (
      refreshToken: string
    ): Promise<{
      accessToken: string;
      refreshToken: string;
      csrfToken: string;
      user: { id: string; username: string; role: string };
    }> => fetchJson("POST", "/api/auth/refresh", { refreshToken }, false),
    logout: (accessToken: string): Promise<{ success: boolean }> =>
      fetchJson("POST", "/api/auth/logout", { accessToken }),
    verifyPassword: (password: string): Promise<{ valid: boolean }> =>
      fetchJson("POST", "/api/auth/verify-password", { password }, false),
    generateRecoveryKey: (): Promise<{ phrase: string }> =>
      fetchJson("POST", "/api/auth/generate-recovery-key", undefined, false),
    recoverPassword: (
      phrase: string,
      newPassword: string
    ): Promise<{ success: boolean; error?: string }> =>
      fetchJson("POST", "/api/auth/recover-password", { phrase, newPassword }, false),
  },
  products: {
    list: (): Promise<Product[]> => fetchJson("GET", "/api/products"),
    listAll: (): Promise<Product[]> => fetchJson("GET", "/api/products?includeArchived=true"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; includeArchived?: boolean; archivedOnly?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Product>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archivedOnly) {
        params.set("archivedOnly", "true");
      } else if (opts.includeArchived) {
        params.set("includeArchived", "true");
      }
      
      const res = await fetchJson<any>("GET", `/api/products?${params.toString()}`);
      
      // Fallback for when the backend server hasn't been restarted yet and still returns a raw array
      if (Array.isArray(res)) {
        return { 
          data: res, 
          meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } 
        };
      }
      
      return res;
    },
    search: (q: string): Promise<Product[]> =>
      fetchJson("GET", `/api/products/search?q=${encodeURIComponent(q)}`),
    getById: (id: string): Promise<Product> => fetchJson("GET", `/api/products/${id}`),
    getByBarcode: (b: string): Promise<Product | null> =>
      fetchJson("GET", `/api/products/barcode/${encodeURIComponent(b)}`),

    /**
     * Fast barcode lookup for POS scanning.
     * Returns only core fields (camelCase from Prisma) to keep the JSON payload tiny.
     * Use this for high-frequency barcode scans; it skips the full normalization
     * and prices relation to minimize payload size.
     */
    getByBarcodeFast: (b: string): Promise<{
      id: string;
      barcode: string;
      name: string;
      salePrice: number;
      purchasePrice: number;
      stockQty: number;
      category: string;
      location: string;
      active: number;
      company: { name: string } | null;
    } | null> =>
      fetchJson(
        "GET",
        `/api/products/barcode-fast/${encodeURIComponent(b)}`
      ),

    /**
     * Socket.io barcode scan — uses persistent WebSocket connection instead of HTTP.
     * Faster for high-frequency POS scans because it avoids HTTP handshake overhead.
     */
    socketProductScan: (b: string) => {
      const s = (window as unknown as { electronAPI?: { socket?: { scanBarcode: (b: string) => Promise<any> } } }).electronAPI?.socket;
      if (!s) {
        throw new Error("Socket.io not available in this environment");
      }
      return s.scanBarcode(b);
    },
    create: (p: ProductInput): Promise<Product> => fetchJson("POST", "/api/products", p),
    update: (id: string, p: ProductInput): Promise<Product> =>
      fetchJson("PUT", `/api/products/${id}`, p),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/products/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/products/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/products/${id}/hard`),
  },
  sales: {
    create: (s: SaleInput): Promise<Sale> => fetchJson("POST", "/api/sales", s),
    listRecent: (l = 10): Promise<Sale[]> => fetchJson("GET", `/api/sales/recent?limit=${l}`),
    getById: (id: string): Promise<Sale | null> => fetchJson("GET", `/api/sales/${id}`),
    search: (q: string): Promise<Sale[]> =>
      fetchJson("GET", `/api/sales/search?q=${encodeURIComponent(q)}`),
    listByDate: (dateStr: string): Promise<Sale[]> => {
      const tzOffset = -new Date().getTimezoneOffset();
      return fetchJson("GET", `/api/sales/date/${dateStr}?tzOffset=${tzOffset}`);
    },
    listAll: (opts?: { search?: string; dateFrom?: string; dateTo?: string }): Promise<Sale[]> => {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts?.dateTo) params.set("dateTo", opts.dateTo);
      params.set("tzOffset", String(-new Date().getTimezoneOffset()));
      return fetchJson("GET", `/api/sales${params.toString() ? `?${params.toString()}` : ""}`);
    },
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Sale>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) params.set("dateTo", opts.dateTo);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      params.set("tzOffset", String(-new Date().getTimezoneOffset()));
      
      const res = await fetchJson<any>("GET", `/api/sales?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
  },
  customers: {
    list: (): Promise<Customer[]> => fetchJson("GET", "/api/customers"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Customer>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/customers?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    search: (q: string): Promise<Customer[]> =>
      fetchJson("GET", `/api/customers/search?q=${encodeURIComponent(q)}`),
    create: (c: CustomerInput): Promise<Customer> => fetchJson("POST", "/api/customers", c),
    update: (id: string, c: CustomerInput): Promise<Customer> =>
      fetchJson("PUT", `/api/customers/${id}`, c),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/customers/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/customers/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/customers/${id}/hard`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/customers/${id}`),
    getById: (id: string): Promise<Customer | null> => fetchJson("GET", `/api/customers/${id}`),
  },
  arrears: {
    list: (status?: string): Promise<Arrear[]> =>
      fetchJson("GET", `/api/arrears${status ? `?status=${status}` : ""}`),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; status?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Arrear>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.status) params.set("status", opts.status);
      if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) params.set("dateTo", opts.dateTo);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      
      const res = await fetchJson<any>("GET", `/api/arrears?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (a: ArrearInput): Promise<Arrear> => fetchJson("POST", "/api/arrears", a),
    recordPayment: (
      id: string,
      amount: number,
      password: string
    ): Promise<{ arrear: Arrear; paymentSaleId: string }> =>
      fetchJson("POST", `/api/arrears/${id}/pay`, { amount, password }),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/arrears/${id}`),
    settle: (id: string, password: string): Promise<{ arrear: Arrear; paymentSaleId: string }> =>
      fetchJson("POST", `/api/arrears/${id}/settle`, { password }),
    listByCustomer: async (opts: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    } = {}): Promise<PaginatedResponse<CustomerArrearSummary>> => {
      const params = new URLSearchParams();
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.status) params.set("status", opts.status);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);

      return fetchJson<PaginatedResponse<CustomerArrearSummary>>(
        "GET",
        `/api/arrears/by-customer?${params.toString()}`
      );
    },
    getCustomerLedger: (customerId: string): Promise<CustomerLedgerDetail> =>
      fetchJson("GET", `/api/arrears/customer/${customerId}/ledger`),
    recordCustomerPayment: (
      customerId: string,
      data: { amount: number; password: string }
    ): Promise<CustomerPaymentReceipt> =>
      fetchJson("POST", `/api/arrears/customer/${customerId}/pay`, data),
  },
  stock: {
    list: (): Promise<StockPurchase[]> => fetchJson("GET", "/api/stock"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<StockPurchase>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) params.set("dateTo", opts.dateTo);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/stock?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (p: StockInput): Promise<StockPurchase> => fetchJson("POST", "/api/stock", p),
    update: (id: string, p: StockInput): Promise<StockPurchase> =>
      fetchJson("PUT", `/api/stock/${id}`, p),
    delete: (id: string): Promise<{ success: boolean }> => fetchJson("DELETE", `/api/stock/${id}`),
    restore: (id: string): Promise<{ success: boolean }> => fetchJson("POST", `/api/stock/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> => fetchJson("DELETE", `/api/stock/${id}/hard`),
  },
  batches: {
    listByProduct: (productId: string): Promise<ProductBatch[]> =>
      fetchJson("GET", `/api/batches/product/${productId}`),
    listExpiring: (days = 60): Promise<ProductBatch[]> =>
      fetchJson("GET", `/api/batches/expiring?days=${days}`),
    trace: (batchNumber: string): Promise<any> =>
      fetchJson("GET", `/api/batches/trace?batchNumber=${encodeURIComponent(batchNumber)}`),
    listAll: async (opts: {
      page?: number;
      limit?: number;
      search?: string;
      productId?: string;
    } = {}): Promise<PaginatedResponse<ProductBatch>> => {
      const params = new URLSearchParams();
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.productId) params.set("productId", opts.productId);
      return fetchJson("GET", `/api/batches?${params.toString()}`);
    },
  },
  distributors: {
    list: (): Promise<Distributor[]> => fetchJson("GET", "/api/distributors"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Distributor>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/distributors?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (d: DistributorInput): Promise<Distributor> =>
      fetchJson("POST", "/api/distributors", d),
    update: (id: string, d: DistributorInput): Promise<Distributor> =>
      fetchJson("PUT", `/api/distributors/${id}`, d),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/distributors/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/distributors/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/distributors/${id}/hard`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/distributors/${id}`),
  },
  companies: {
    list: (): Promise<Company[]> => fetchJson("GET", "/api/companies"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Company>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/companies?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (c: CompanyInput): Promise<Company> => fetchJson("POST", "/api/companies", c),
    update: (id: string, c: CompanyInput): Promise<Company> =>
      fetchJson("PUT", `/api/companies/${id}`, c),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/companies/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/companies/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/companies/${id}/hard`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/companies/${id}`),
    getById: (id: string): Promise<CompanyDetail> => fetchJson("GET", `/api/companies/${id}`),
    report: async (opts: { search?: string } = {}): Promise<CompanyReport> => {
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      const qs = params.toString();
      return fetchJson("GET", `/api/companies/report${qs ? `?${qs}` : ""}`);
    },
  },
  returns: {
    list: (): Promise<ReturnEntry[]> => fetchJson("GET", "/api/returns"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<ReturnEntry>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      
      const res = await fetchJson<any>("GET", `/api/returns?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    getById: (id: string): Promise<ReturnEntry> => fetchJson("GET", `/api/returns/${id}`),
    create: (r: ReturnInput): Promise<ReturnEntry> => fetchJson("POST", "/api/returns", r),
  },
  expenses: {
    list: (): Promise<Expense[]> => fetchJson("GET", "/api/expenses"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Expense>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) params.set("dateTo", opts.dateTo);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/expenses?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (e: ExpenseInput): Promise<Expense> => fetchJson("POST", "/api/expenses", e),
    update: (id: string, e: ExpenseInput): Promise<Expense> =>
      fetchJson("PUT", `/api/expenses/${id}`, e),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/expenses/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/expenses/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/expenses/${id}/hard`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/expenses/${id}`),
  },

  categories: {
    list: (opts?: { archived?: boolean }): Promise<Category[]> =>
      fetchJson("GET", `/api/categories${opts?.archived ? "?archived=true" : ""}`),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; archived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<Category>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.archived) params.set("archived", "true");
      
      const res = await fetchJson<any>("GET", `/api/categories?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (c: CategoryInput): Promise<Category> => fetchJson("POST", "/api/categories", c),
    update: (id: string, c: CategoryInput): Promise<Category> =>
      fetchJson("PUT", `/api/categories/${id}`, c),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/categories/${id}`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/categories/${id}/restore`),
    hardDelete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/categories/${id}/hard`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/categories/${id}`),
  },
  dashboard: {
    stats: (): Promise<DashboardStats> => fetchJson("GET", "/api/dashboard/stats"),
  },
  reports: {
    stats: (): Promise<DashboardStats> => fetchJson("GET", "/api/reports/stats"),
    productReport: (opts: {
      productId: string;
      dateFrom?: string;
      dateTo?: string;
    }): Promise<ProductReportData> => {
      const params = new URLSearchParams();
      params.set("productId", opts.productId);
      if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) params.set("dateTo", opts.dateTo);
      params.set("tzOffset", String(-new Date().getTimezoneOffset()));
      return fetchJson("GET", `/api/reports/product?${params.toString()}`);
    },
  },
  settings: {
    backupCreate: (): Promise<BackupResult> => fetchJson("POST", "/api/settings/backup"),
    backupList: (): Promise<BackupEntry[]> => fetchJson("GET", "/api/settings/backups"),
    backupDelete: (name: string): Promise<{ success: boolean; error?: string }> =>
      fetchJson("DELETE", "/api/settings/backup", { name }),
    backupRestore: (name: string): Promise<{ success: boolean; error?: string }> =>
      fetchJson("POST", "/api/settings/backup/restore", { name }),
    getBackupDirectory: (): Promise<{ path: string }> =>
      fetchJson("GET", "/api/settings/backup/directory"),
    setBackupDirectory: (path: string): Promise<{ success: boolean; path: string }> =>
      fetchJson("PUT", "/api/settings/backup/directory", { path }),
    getAutoBackupConfig: (): Promise<AutoBackupConfig> =>
      fetchJson("GET", "/api/settings/auto-backup"),
    saveAutoBackupConfig: (cfg: AutoBackupConfig): Promise<{ success: boolean }> =>
      fetchJson("PUT", "/api/settings/auto-backup", cfg),
    gdriveGetConfig: (): Promise<GDriveConfig> => fetchJson("GET", "/api/settings/gdrive"),
    gdriveSaveConfig: (cfg: GDriveConfig): Promise<{ success: boolean }> =>
      fetchJson("PUT", "/api/settings/gdrive", cfg),
  },
  barcodes: {
    list: (): Promise<BarcodeEntry[]> => fetchJson("GET", "/api/barcodes"),
    listAll: (): Promise<BarcodeEntry[]> => fetchJson("GET", "/api/barcodes?includeArchived=true"),
    listPaginated: async (opts: { page?: number; limit?: number; search?: string; includeArchived?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }): Promise<PaginatedResponse<BarcodeEntry>> => {
      const params = new URLSearchParams();
      params.set("paginated", "true");
      if (opts.page) params.set("page", String(opts.page));
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      if (opts.sortBy) params.set("sortBy", opts.sortBy);
      if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
      if (opts.includeArchived) params.set("includeArchived", "true");
      
      const res = await fetchJson<any>("GET", `/api/barcodes?${params.toString()}`);
      if (Array.isArray(res)) {
        return { data: res, meta: { total: res.length, page: opts.page || 1, limit: opts.limit || 50, totalPages: 1 } };
      }
      return res;
    },
    create: (code: string): Promise<BarcodeEntry> => fetchJson("POST", "/api/barcodes", { code }),
    archive: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/barcodes/${id}/archive`),
    restore: (id: string): Promise<{ success: boolean }> =>
      fetchJson("POST", `/api/barcodes/${id}/restore`),
    delete: (id: string): Promise<{ success: boolean }> =>
      fetchJson("DELETE", `/api/barcodes/${id}`),
  },
};

export { api };
