import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { loadConfig, saveConfig, getBackupsDir } from "./config.js";

import {
  printReceipt,
  printReturnReceipt,
  printBarcodeLabel,
  generateHTML,
  generateReturnReceiptHTML,
} from "./printer.js";

function getLocalIp() {
  const ifaces = os.networkInterfaces();

  function isEthernet(name) {
    const lower = name.toLowerCase();
    return (
      lower.startsWith("en") ||
      lower.startsWith("eth") ||
      lower.startsWith("enp") ||
      lower.startsWith("ens") ||
      lower.includes("ethernet") ||
      lower.includes("thunderbolt")
    );
  }

  let fallback = null;

  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (isEthernet(name)) return iface.address;
        if (!fallback) fallback = iface.address;
      }
    }
  }

  return fallback || "127.0.0.1";
}

function ensureBackupsDir() {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function registerHandlers() {
  ipcMain.on("config:get-sync", (event) => {
    event.returnValue = loadConfig();
  });

  ipcMain.handle("config:save", (_, cfg) => {
    saveConfig(cfg);
    return { success: true };
  });

  ipcMain.handle("server:ip", () => getLocalIp());

  ipcMain.handle("whatsapp:open-chat", async (_, phone, message) => {
    if (typeof phone !== "string" || !/^\d{8,15}$/.test(phone)) {
      throw new Error("A valid international phone number is required");
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 2000) {
      throw new Error("A valid WhatsApp message is required");
    }
    await shell.openExternal(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    );
    return { success: true };
  });

  ipcMain.handle("window:toggle-fullscreen", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return { success: false };
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return { success: true, fullscreen: next };
  });

  ipcMain.handle("printers:list", async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return [];
    try {
      return await win.webContents.getPrintersAsync();
    } catch {
      return [];
    }
  });

  ipcMain.handle("config:get-printer", () => {
    return loadConfig().printer || { paperSize: "thermal", deviceName: null };
  });

  ipcMain.handle("config:save-printer", (_, printerConfig) => {
    const cfg = loadConfig();
    cfg.printer = printerConfig;
    saveConfig(cfg);
    return { success: true };
  });

  ipcMain.handle("print:receipt", async (_, sale, printerConfig) => {
    try {
      await printReceipt(sale, printerConfig);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("print:return-receipt", async (_, returnData, sale, printerConfig) => {
    try {
      await printReturnReceipt(returnData, sale, printerConfig);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle(
    "print:barcode-label",
    async (_, barcode, copies, svgHtml, labelWidth, labelHeight, deviceName, productName) => {
      try {
        await printBarcodeLabel(
          barcode,
          copies,
          svgHtml,
          labelWidth,
          labelHeight,
          deviceName,
          productName
        );
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  );

  ipcMain.handle("print:generate-receipt-html", (_, sale, paperSize) => {
    try {
      const html = generateHTML(sale, paperSize || "thermal");
      return { success: true, html };
    } catch (e) {
      return { success: false, error: e.message, html: "" };
    }
  });

  ipcMain.handle("print:generate-return-receipt-html", (_, returnData, sale, paperSize) => {
    try {
      const html = generateReturnReceiptHTML(returnData, sale, paperSize || "thermal");
      return { success: true, html };
    } catch (e) {
      return { success: false, error: e.message, html: "" };
    }
  });

  // Settings - Backup
  ensureBackupsDir();

  ipcMain.handle("settings:backup-create", () => {
    try {
      const dir = getBackupsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backupName = `faraz-pharmacy-backup-${timestamp}.db`;
      const backupPath = path.join(dir, backupName);
      fs.writeFileSync(backupPath, "");
      const stat = fs.statSync(backupPath);
      return {
        success: true,
        name: backupName,
        path: backupPath,
        size: stat.size,
        createdAt: new Date(stat.birthtime || stat.mtime).toISOString(),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("settings:backup-list", () => {
    try {
      const dir = getBackupsDir();
      if (!fs.existsSync(dir)) return [];
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".db"))
        .map((f) => {
          const fp = path.join(dir, f);
          const stat = fs.statSync(fp);
          return {
            name: f,
            path: fp,
            size: stat.size,
            createdAt: new Date(stat.birthtime || stat.mtime).toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return files;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle("settings:backup-delete", (_, { name }) => {
    try {
      const fp = path.join(getBackupsDir(), name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("settings:backup-restore", (_, { name }) => {
    try {
      const backupPath = path.join(getBackupsDir(), name);
      if (!fs.existsSync(backupPath)) throw new Error("Backup file not found");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("settings:backup-directory-pick", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const selectedPath = result.filePaths[0];
    const cfg = loadConfig();
    cfg.backupDirectory = selectedPath;
    saveConfig(cfg);
    return { canceled: false, path: selectedPath };
  });

  ipcMain.handle("settings:get-backup-directory", () => {
    return { path: getBackupsDir() };
  });

  // Settings - Google Drive Config
  ipcMain.handle("settings:gdrive-get-config", () => {
    const cfg = loadConfig();
    return (
      cfg.googleDrive || {
        clientId: "",
        clientSecret: "",
        redirectUri: "",
        refreshToken: "",
        autoUpload: false,
        connected: false,
      }
    );
  });

  ipcMain.handle("settings:gdrive-save-config", (_, gdriveCfg) => {
    const cfg = loadConfig();
    cfg.googleDrive = gdriveCfg;
    saveConfig(cfg);
    return { success: true };
  });
}

export { registerHandlers };
