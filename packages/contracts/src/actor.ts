import { z } from "zod";

export const ActorKindSchema = z.enum(["human", "agent"]);
export const ActorStatusSchema = z.enum(["available", "busy", "offline", "error"]);
export const ActorSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  kind: ActorKindSchema,
  provider: z.string().min(1).max(100),
  model: z.string().max(200).nullable(),
  status: ActorStatusSchema,
  capabilities: z.array(z.string().min(1).max(100)).max(50),
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateActorSchema = z.object({
  id: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/).optional(),
  name: z.string().trim().min(1).max(200),
  kind: ActorKindSchema,
  provider: z.string().trim().min(1).max(100).default("local"),
  model: z.string().trim().max(200).nullable().default(null),
  status: ActorStatusSchema.default("available"),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
});
export const UpdateActorSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().max(200).nullable().optional(),
  status: ActorStatusSchema.optional(),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要更新的字段" });

export type Actor = z.infer<typeof ActorSchema>;
export type CreateActorInput = z.infer<typeof CreateActorSchema>;
export type UpdateActorInput = z.infer<typeof UpdateActorSchema>;
