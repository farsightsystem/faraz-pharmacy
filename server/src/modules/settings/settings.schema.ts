import { z } from "zod";

export const gdriveConfigSchema = z.object({
  clientId: z.string().optional().default(""),
  clientSecret: z.string().optional().default(""),
  redirectUri: z.string().optional().default(""),
  refreshToken: z.string().optional().default(""),
  autoUpload: z.boolean().optional().default(false),
  connected: z.boolean().optional().default(false),
});

export type GDriveConfig = z.infer<typeof gdriveConfigSchema>;

// PUT /backup/directory
export const backupDirectorySchema = z.object({
  path: z.string().min(1, "Directory path is required"),
});

export type BackupDirectoryInput = z.infer<typeof backupDirectorySchema>;

// PUT /auto-backup ("HH:MM" 24-hour time)
export const autoBackupConfigSchema = z.object({
  enabled: z.boolean(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24-hour)"),
});

export type AutoBackupConfigInput = z.infer<typeof autoBackupConfigSchema>;
