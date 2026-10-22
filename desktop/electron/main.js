import { app, BrowserWindow, Menu, ipcMain, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerHandlers } from "./ipc-handlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev =
  process.env.NODE_ENV === "development" || process.argv.includes("--dev") || !app.isPackaged;

const template = [
  ...(process.platform === "darwin"
    ? [
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ]
    : []),
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(process.platform === "darwin"
        ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
        : [{ role: "close" }]),
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

let windowSeq = 0;
const posWindows = new Map();
let posWindowCounter = 0;
const returnWindows = new Map();
let returnWindowCounter = 0;

function createWindow({ posOnly = false, returnOnly = false } = {}) {
  windowSeq += 1;
  const isPrimary = windowSeq === 1;
  const targetHash = returnOnly
    ? "/returns/terminal?standalone=1"
    : posOnly
      ? "/pos?pos=1"
      : "/pos";

  const winOptions = {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Faraz Pharmacy",
    icon: path.join(__dirname, "..", "src", "asset", "image", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
  };

  if (posOnly) {
    posWindowCounter++;
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    winOptions.width = Math.round(screenWidth * 0.8);
    winOptions.height = Math.round(screenHeight * 0.8);
    winOptions.minWidth = Math.round(screenWidth * 0.6);
    winOptions.minHeight = Math.round(screenHeight * 0.6);
    const x = Math.round((screenWidth - winOptions.width) / 2);
    const y = Math.round((screenHeight - winOptions.height) / 2);
    winOptions.x = x;
    winOptions.y = y;
    winOptions.title = `Faraz Pharmacy - Sale ${posWindowCounter}`;
  } else if (returnOnly) {
    returnWindowCounter++;
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const cascadeOffset = (returnWindowCounter - 1) * 30;
    const x = Math.min(
      Math.round((screenWidth - winOptions.width) / 2) + cascadeOffset + 40,
      screenWidth - 200
    );
    const y = Math.min(
      Math.round((screenHeight - winOptions.height) / 2) + cascadeOffset + 40,
      screenHeight - 200
    );
    winOptions.x = x;
    winOptions.y = y;
    winOptions.title = `Faraz Pharmacy - Returns Desk ${returnWindowCounter}`;
  }

  const win = new BrowserWindow(winOptions);

  if (posOnly) {
    const winId = win.id;
    posWindows.set(winId, win);
    win.on("closed", () => {
      posWindows.delete(winId);
      if (posWindows.size === 0) posWindowCounter = 0;
    });
  } else if (returnOnly) {
    const winId = win.id;
    returnWindows.set(winId, win);
    win.on("closed", () => {
      returnWindows.delete(winId);
      if (returnWindows.size === 0) returnWindowCounter = 0;
    });
  }

  if (isDev) {
    const DEV_URL = "http://localhost:5173";
    const loadDev = (attempt = 0) => {
      win.loadURL(`${DEV_URL}/#${targetHash}`).catch(() => {
        if (attempt < 60) {
          setTimeout(() => loadDev(attempt + 1), 500);
        }
      });
    };
    loadDev();
    if (isPrimary) {
      win.webContents.once("did-finish-load", () =>
        win.webContents.openDevTools({ mode: "detach" })
      );
    }
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: targetHash });
  }

  win.once("ready-to-show", () => win.show());
  return win;
}

ipcMain.handle("pos:open-window", () => {
  try {
    const win = createWindow({ posOnly: true });
    if (win) return { success: true, windowId: win.id };
    return { success: false, error: "Could not create window" };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("pos:window-count", () => {
  return posWindows.size;
});

ipcMain.handle("returns:open-window", () => {
  try {
    const win = createWindow({ returnOnly: true });
    if (win) return { success: true, windowId: win.id };
    return { success: false, error: "Could not create window" };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("returns:window-count", () => {
  return returnWindows.size;
});

app.whenReady().then(() => {
  registerHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
