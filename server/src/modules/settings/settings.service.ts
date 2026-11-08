import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { prisma } from "../../services/prisma";
import type { GDriveConfig } from "./settings.schema";

const dataDir = process.env.FARAZ_DATA_DIR || path.join(os.homedir(), ".faraz-pharmacy");

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function findPgBinary(name: string): string {
  const cmd = process.platform === "win32" ? `where.exe ${name}` : `which ${name}`;
  try {
    const found = execSync(cmd, { encoding: "utf-8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (found) return found;
  } catch {
    // not on PATH, fall through to common install locations
  }
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const roots =
    process.platform === "win32"
      ? ["C:\\Program Files\\PostgreSQL", "C:\\Program Files (x86)\\PostgreSQL", "D:\\PostgreSQL"]
      : ["/usr/lib/postgresql", "/opt/postgresql", "/usr/local/bin"];
  if (process.platform === "win32") {
    try {
      const versions = fs.readdirSync(roots[0]);
      for (const version of versions.sort().reverse()) {
        const candidate = path.join(roots[0], version, "bin", exe);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      // no default install dir
    }
  } else {
    try {
      const versions = fs.readdirSync(roots[0]);
      for (const version of versions.sort().reverse()) {
        for (const bin of ["bin", "bin/psql"]) {
          const candidate = path.join(roots[0], version, bin, exe);
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // no default install dir
    }
  }
  throw new Error(`${name} not found. Install PostgreSQL or add ${name} to PATH.`);
}

function getConfigPath() {
  ensureDataDir();
  return path.join(dataDir, "config.json");
}

function loadConfig(): Record<string, unknown> {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg: Record<string, unknown>) {
  ensureDataDir();
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}

function getConfiguredBackupDir(): string {
  const cfg = loadConfig();
  const custom = cfg.backupDirectory as string | undefined;
  if (custom && custom.trim()) return path.resolve(custom);
  return path.join(dataDir, "backups");
}

function ensureBackupDir() {
  const dir = getConfiguredBackupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const settingsService = {
  // Backups
  async createBackup() {
    ensureDataDir();
    const backupDir = ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupName = `faraz-pharmacy-backup-${timestamp}.sql`;
    const backupPath = path.join(backupDir, backupName);

    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl) throw new Error("DATABASE_URL is not configured");
    const pgDump = findPgBinary("pg_dump");
    execSync(`"${pgDump}" --clean --if-exists "${dbUrl}" > "${backupPath}"`);

    const stat = fs.statSync(backupPath);
    return {
      success: true,
      name: backupName,
      path: backupPath,
      size: stat.size,
      createdAt: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
    };
  },

  listBackups() {
    ensureDataDir();
    const backupDir = getConfiguredBackupDir();
    if (!fs.existsSync(backupDir)) return [];

    return fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => {
        const fp = path.join(backupDir, f);
        const stat = fs.statSync(fp);
        return {
          name: f,
          path: fp,
          size: stat.size,
          createdAt: (stat.birthtime || stat.mtime).toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  deleteBackup(name: string) {
    const backupDir = getConfiguredBackupDir();
    const fp = path.join(backupDir, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { success: true };
  },

  restoreBackup(name: string) {
    const backupDir = getConfiguredBackupDir();
    const backupPath = path.join(backupDir, name);
    if (!fs.existsSync(backupPath)) throw new Error("Backup file not found");

    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl) throw new Error("DATABASE_URL is not configured");
    const psql = findPgBinary("psql");
    execSync(`"${psql}" "${dbUrl}" < "${backupPath}"`, { stdio: "pipe" });
    return { success: true };
  },

  getBackupDirectory() {
    ensureDataDir();
    return { path: getConfiguredBackupDir() };
  },

  setBackupDirectory(dir: string) {
    if (!dir || !dir.trim()) throw new Error("Directory path is required");
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    const cfg = loadConfig();
    cfg.backupDirectory = resolved;
    saveConfig(cfg);
    return { success: true, path: resolved };
  },

  // Auto backup config
  getAutoBackupConfig() {
    const cfg = loadConfig();
    return (cfg.autoBackup as Record<string, unknown>) || { enabled: false, time: "02:00" };
  },

  saveAutoBackupConfig(autoBackup: { enabled: boolean; time: string }) {
    const cfg = loadConfig();
    cfg.autoBackup = {
      enabled: !!autoBackup.enabled,
      // Route-level zod validation guarantees "HH:MM"; keep a sane fallback anyway
      time: typeof autoBackup.time === "string" && autoBackup.time ? autoBackup.time : "02:00",
    };
    saveConfig(cfg);
    return { success: true };
  },

  // Google Drive config
  getGdriveConfig() {
    const cfg = loadConfig();
    return (
      (cfg.googleDrive as Record<string, unknown>) || {
        clientId: "",
        clientSecret: "",
        redirectUri: "",
        refreshToken: "",
        autoUpload: false,
        connected: false,
      }
    );
  },

  saveGdriveConfig(gdriveConfig: GDriveConfig) {
    const cfg = loadConfig();
    // Normalize via the shared type: fill omitted optional fields with defaults
    cfg.googleDrive = {
      clientId: gdriveConfig.clientId ?? "",
      clientSecret: gdriveConfig.clientSecret ?? "",
      redirectUri: gdriveConfig.redirectUri ?? "",
      refreshToken: gdriveConfig.refreshToken ?? "",
      autoUpload: !!gdriveConfig.autoUpload,
      connected: !!gdriveConfig.connected,
    };
    saveConfig(cfg);
    return { success: true };
  },
};
