const { contextBridge, ipcRenderer } = require("electron");
const { io } = require("socket.io-client");

contextBridge.exposeInMainWorld("appConfig", ipcRenderer.sendSync("config:get-sync"));

let socket = null;

function getSocket() {
  if (!socket) {
    const serverUrl = (window.appConfig && window.appConfig.serverUrl) || "http://localhost:3001";
    socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

contextBridge.exposeInMainWorld("electronAPI", {
  printers: {
    list: () => ipcRenderer.invoke("printers:list"),
    getConfig: () => ipcRenderer.invoke("config:get-printer"),
    saveConfig: (cfg) => ipcRenderer.invoke("config:save-printer", cfg),
  },
  settings: {
    backupCreate: () => ipcRenderer.invoke("settings:backup-create"),
    backupList: () => ipcRenderer.invoke("settings:backup-list"),
    backupDelete: (name) => ipcRenderer.invoke("settings:backup-delete", { name }),
    backupRestore: (name) => ipcRenderer.invoke("settings:backup-restore", { name }),
    backupDirectoryPick: () => ipcRenderer.invoke("settings:backup-directory-pick"),
    getBackupDirectory: () => ipcRenderer.invoke("settings:get-backup-directory"),
    gdriveGetConfig: () => ipcRenderer.invoke("settings:gdrive-get-config"),
    gdriveSaveConfig: (cfg) => ipcRenderer.invoke("settings:gdrive-save-config", cfg),
  },
  pos: {
    openWindow: () => ipcRenderer.invoke("pos:open-window"),
    getWindowCount: () => ipcRenderer.invoke("pos:window-count"),
  },
  socket: {
    scanBarcode: (barcode) => {
      return new Promise((resolve, reject) => {
        try {
          const s = getSocket();
          s.emit("product:scan", { barcode }, (result) => {
            resolve(result);
          });
        } catch (err) {
          reject(err);
        }
      });
    },
    disconnect: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    },
  },
});

contextBridge.exposeInMainWorld("saveConfig", (cfg) => ipcRenderer.invoke("config:save", cfg));
contextBridge.exposeInMainWorld("getServerIp", () => ipcRenderer.invoke("server:ip"));
contextBridge.exposeInMainWorld("printReceipt", (sale, printerConfig) =>
  ipcRenderer.invoke("print:receipt", sale, printerConfig)
);
contextBridge.exposeInMainWorld("printReturnReceipt", (returnData, sale, printerConfig) =>
  ipcRenderer.invoke("print:return-receipt", returnData, sale, printerConfig)
);
contextBridge.exposeInMainWorld(
  "printBarcodeLabel",
  (barcode, copies, svgHtml, labelWidth, labelHeight, deviceName, productName) =>
    ipcRenderer.invoke(
      "print:barcode-label",
      barcode,
      copies,
      svgHtml,
      labelWidth,
      labelHeight,
      deviceName,
      productName
    )
);
contextBridge.exposeInMainWorld("generateReceiptHTML", (sale, paperSize) =>
  ipcRenderer.invoke("print:generate-receipt-html", sale, paperSize)
);
contextBridge.exposeInMainWorld("generateReturnReceiptHTML", (returnData, sale, paperSize) =>
  ipcRenderer.invoke("print:generate-return-receipt-html", returnData, sale, paperSize)
);
contextBridge.exposeInMainWorld("toggleFullscreen", () =>
  ipcRenderer.invoke("window:toggle-fullscreen")
);
contextBridge.exposeInMainWorld("openPosWindow", () => ipcRenderer.invoke("pos:open-window"));
contextBridge.exposeInMainWorld("getPosWindowCount", () => ipcRenderer.invoke("pos:window-count"));
contextBridge.exposeInMainWorld("openReturnWindow", () => ipcRenderer.invoke("returns:open-window"));
contextBridge.exposeInMainWorld("getReturnWindowCount", () => ipcRenderer.invoke("returns:window-count"));
