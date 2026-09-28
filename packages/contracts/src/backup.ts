import { z } from "zod";

export const BackupKindSchema = z.enum(["manual", "pre_restore", "imported"]);

export const BackupRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: BackupKindSchema,
  createdAt: z.string().datetime(),
  schemaVersion: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  includesSecrets: z.boolean(),
  sourceAppVersion: z.string(),
});

export const CreateBackupInputSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
});

export const BackupPathInputSchema = z.object({
  directory: z.string().trim().min(1).max(4096),
});

export const RestoreBackupInputSchema = z.object({
  confirmationToken: z.string().uuid(),
});

export type BackupKind = z.infer<typeof BackupKindSchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type CreateBackupInput = z.infer<typeof CreateBackupInputSchema>;
export type BackupPathInput = z.infer<typeof BackupPathInputSchema>;
export type RestoreBackupInput = z.infer<typeof RestoreBackupInputSchema>;
