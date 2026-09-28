import { z } from "zod";

const DateTimeSchema = z.string().datetime();
export const AgentWritePolicySchema = z.enum(["disabled", "proposal_only", "low_risk_direct"]);
export const RelationshipCapturePolicySchema = z.enum(["manual", "mentions", "automatic"]);
export const ThemePreferenceSchema = z.enum(["system", "light", "dark"]);

export const ProjectPolicySchema = z.object({
  projectId: z.string().min(1).max(200),
  agentWritePolicy: AgentWritePolicySchema,
  relationshipCapturePolicy: RelationshipCapturePolicySchema,
  autoLogEnabled: z.boolean(),
  logRetentionDays: z.number().int().min(0).max(3650),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const UpdateProjectPolicySchema = z.object({
  agentWritePolicy: AgentWritePolicySchema.optional(),
  relationshipCapturePolicy: RelationshipCapturePolicySchema.optional(),
  autoLogEnabled: z.boolean().optional(),
  logRetentionDays: z.number().int().min(0).max(3650).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个项目策略字段" });

export const GlobalPreferencesSchema = z.object({
  launchAtLogin: z.boolean(),
  minimizeToTray: z.boolean(),
  startDaemonOnLaunch: z.boolean(),
  theme: ThemePreferenceSchema,
  weekStartsOn: z.enum(["monday", "sunday"]),
  compactMode: z.boolean(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const UpdateGlobalPreferencesSchema = z.object({
  launchAtLogin: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  startDaemonOnLaunch: z.boolean().optional(),
  theme: ThemePreferenceSchema.optional(),
  weekStartsOn: z.enum(["monday", "sunday"]).optional(),
  compactMode: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个全局偏好字段" });

export const RuntimeDiagnosticsSchema = z.object({
  checkedAt: DateTimeSchema,
  daemon: z.object({
    status: z.literal("ok"),
    version: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    pid: z.number().int().positive(),
    nodeVersion: z.string(),
    platform: z.string(),
    host: z.string(),
    port: z.number().int().positive(),
  }),
  data: z.object({
    databasePath: z.string(),
    dataDirectory: z.string(),
    databaseBytes: z.number().int().nonnegative(),
    writable: z.boolean(),
    migration: z.string(),
  }),
  services: z.object({
    mcp: z.literal("ready"),
    organizer: z.enum(["running", "disabled"]),
    workspaceWatcher: z.enum(["running", "disabled"]),
  }),
});

export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>;
export type UpdateProjectPolicyInput = z.infer<typeof UpdateProjectPolicySchema>;
export type GlobalPreferences = z.infer<typeof GlobalPreferencesSchema>;
export type UpdateGlobalPreferencesInput = z.infer<typeof UpdateGlobalPreferencesSchema>;
export type RuntimeDiagnostics = z.infer<typeof RuntimeDiagnosticsSchema>;
