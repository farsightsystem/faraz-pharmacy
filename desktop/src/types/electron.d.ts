import type { PrinterConfig } from "./index";

export interface ElectronAPI {
  printers: {
    list(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>;
    getConfig(): Promise<PrinterConfig>;
    saveConfig(cfg: PrinterConfig): Promise<{ success: boolean }>;
  };
  settings: {
    backupCreate(): Promise<BackupResult>;
    backupList(): Promise<BackupEntry[]>;
    backupDelete(name: string): Promise<{ success: boolean; error?: string }>;
    backupRestore(name: string): Promise<{ success: boolean; error?: string }>;
    backupDirectoryPick(): Promise<{ canceled: boolean; path?: string }>;
    getBackupDirectory(): Promise<{ path: string }>;
    gdriveGetConfig(): Promise<GDriveConfig>;
    gdriveSaveConfig(cfg: GDriveConfig): Promise<{ success: boolean }>;
  };
  pos: {
    openWindow(): Promise<{ success: boolean; windowId?: number; error?: string }>;
    getWindowCount(): Promise<number>;
  };
  socket: {
    scanBarcode(barcode: string): Promise<{
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
    } | null>;
    disconnect(): void;
  };
}

export interface AppConfig {
  mode?: string;
  serverUrl?: string;
  serverPort?: number;
  printer?: PrinterConfig;
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface BackupResult {
  success: boolean;
  name?: string;
  path?: string;
  size?: number;
  createdAt?: string;
  error?: string;
}

export interface GDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  autoUpload: boolean;
  connected: boolean;
}

export interface AutoBackupConfig {
  enabled: boolean;
  time: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    saveConfig: (config: { mode: string; serverUrl?: string }) => Promise<{ success: boolean }>;
    getServerIp: () => Promise<string>;
    appConfig: AppConfig;
    printReceipt: (
      sale: unknown,
      printerConfig?: PrinterConfig
    ) => Promise<{ success: boolean; error?: string }>;
    printReturnReceipt: (
      returnData: unknown,
      sale: unknown,
      printerConfig?: PrinterConfig
    ) => Promise<{ success: boolean; error?: string }>;
    printBarcodeLabel: (
      barcode: string,
      copies: number,
      svgHtml?: string,
      labelWidth?: number,
      labelHeight?: number,
      deviceName?: string,
      productName?: string
    ) => Promise<{ success: boolean; error?: string }>;
    generateReceiptHTML: (
      sale: unknown,
      paperSize?: string
    ) => Promise<{ success: boolean; html: string; error?: string }>;
    generateReturnReceiptHTML: (
      returnData: unknown,
      sale: unknown,
      paperSize?: string
    ) => Promise<{ success: boolean; html: string; error?: string }>;
    toggleFullscreen: () => Promise<{ success: boolean; fullscreen?: boolean }>;
    openPosWindow: () => Promise<{ success: boolean; windowId?: number; error?: string }>;
    getPosWindowCount: () => Promise<number>;
    openReturnWindow: () => Promise<{ success: boolean; windowId?: number; error?: string }>;
    getReturnWindowCount: () => Promise<number>;
  }
}
