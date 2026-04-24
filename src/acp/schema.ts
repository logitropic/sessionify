import { z } from 'zod';

export const acpRoleSchema = z.enum(['assistant', 'user']);
export type AcpRole = z.infer<typeof acpRoleSchema>;

export const acpMetaSchema = z.record(z.string(), z.unknown());

export const textContentSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    annotations: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type TextContent = z.infer<typeof textContentSchema>;

export const imageContentSchema = z
  .object({
    type: z.literal('image'),
    data: z.string(),
    mimeType: z.string(),
    uri: z.string().nullable().optional(),
    annotations: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ImageContent = z.infer<typeof imageContentSchema>;

export const audioContentSchema = z
  .object({
    type: z.literal('audio'),
    data: z.string(),
    mimeType: z.string(),
    annotations: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type AudioContent = z.infer<typeof audioContentSchema>;

export const resourceLinkSchema = z
  .object({
    type: z.literal('resource_link'),
    name: z.string(),
    uri: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    size: z.number().int().nullable().optional(),
    annotations: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ResourceLink = z.infer<typeof resourceLinkSchema>;

export const embeddedResourceSchema = z
  .object({
    type: z.literal('resource'),
    resource: z.unknown(),
    annotations: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type EmbeddedResource = z.infer<typeof embeddedResourceSchema>;

export const contentBlockSchema = z.discriminatedUnion('type', [
  textContentSchema,
  imageContentSchema,
  audioContentSchema,
  resourceLinkSchema,
  embeddedResourceSchema,
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const contentChunkSchema = z
  .object({
    content: contentBlockSchema,
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ContentChunk = z.infer<typeof contentChunkSchema>;

export const contentSchema = z
  .object({
    content: contentBlockSchema,
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type AcpContent = z.infer<typeof contentSchema>;

export const toolKindSchema = z.enum([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
]);
export type ToolKind = z.infer<typeof toolKindSchema>;

export const toolCallStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed']);
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

export const toolCallLocationSchema = z
  .object({
    path: z.string(),
    line: z.number().int().nonnegative().nullable().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ToolCallLocation = z.infer<typeof toolCallLocationSchema>;

export const toolCallContentSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('content'),
      content: contentSchema,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('diff'),
      path: z.string().optional(),
      oldText: z.string().optional(),
      newText: z.string().optional(),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('terminal'),
      terminalId: z.string(),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
]);
export type ToolCallContent = z.infer<typeof toolCallContentSchema>;

export const toolCallSchema = z
  .object({
    toolCallId: z.string(),
    title: z.string(),
    kind: toolKindSchema.optional(),
    locations: z.array(toolCallLocationSchema).optional(),
    content: z.array(toolCallContentSchema).optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    status: toolCallStatusSchema.optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ToolCall = z.infer<typeof toolCallSchema>;

export const toolCallUpdateSchema = z
  .object({
    toolCallId: z.string(),
    title: z.string().nullable().optional(),
    kind: toolKindSchema.nullable().optional(),
    locations: z.array(toolCallLocationSchema).nullable().optional(),
    content: z.array(toolCallContentSchema).nullable().optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    status: toolCallStatusSchema.nullable().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ToolCallUpdate = z.infer<typeof toolCallUpdateSchema>;

export const planEntrySchema = z
  .object({
    content: z.string(),
    priority: z.number(),
    status: z.string(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type PlanEntry = z.infer<typeof planEntrySchema>;

export const planSchema = z
  .object({
    entries: z.array(planEntrySchema),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type Plan = z.infer<typeof planSchema>;

export const availableCommandSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    input: z.unknown().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type AvailableCommand = z.infer<typeof availableCommandSchema>;

export const availableCommandsUpdateSchema = z
  .object({
    availableCommands: z.array(availableCommandSchema),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type AvailableCommandsUpdate = z.infer<typeof availableCommandsUpdateSchema>;

export const currentModeUpdateSchema = z
  .object({
    currentModeId: z.string(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type CurrentModeUpdate = z.infer<typeof currentModeUpdateSchema>;

export const configOptionUpdateSchema = z
  .object({
    configOptions: z.array(z.unknown()),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type ConfigOptionUpdate = z.infer<typeof configOptionUpdateSchema>;

export const sessionInfoUpdateSchema = z
  .object({
    title: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type SessionInfoUpdate = z.infer<typeof sessionInfoUpdateSchema>;

export const sessionInfoSchema = z
  .object({
    sessionId: z.string(),
    cwd: z.string(),
    title: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const sessionUpdateSchema = z.discriminatedUnion('sessionUpdate', [
  z
    .object({
      sessionUpdate: z.literal('user_message_chunk'),
      content: contentChunkSchema,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('agent_message_chunk'),
      content: contentChunkSchema,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('agent_thought_chunk'),
      content: contentChunkSchema,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('tool_call'),
      ...toolCallSchema.shape,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('tool_call_update'),
      ...toolCallUpdateSchema.shape,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('plan'),
      entries: z.array(planEntrySchema),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('available_commands_update'),
      availableCommands: z.array(availableCommandSchema),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('current_mode_update'),
      currentModeId: z.string(),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('config_option_update'),
      configOptions: z.array(z.unknown()),
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      sessionUpdate: z.literal('session_info_update'),
      ...sessionInfoUpdateSchema.shape,
      _meta: acpMetaSchema.optional(),
    })
    .passthrough(),
]);
export type SessionUpdate = z.infer<typeof sessionUpdateSchema>;

export const sessionIdSchema = z.string();
export type SessionId = z.infer<typeof sessionIdSchema>;

export const sessionNotificationSchema = z
  .object({
    sessionId: sessionIdSchema,
    update: sessionUpdateSchema,
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type SessionNotification = z.infer<typeof sessionNotificationSchema>;

export const promptRequestSchema = z
  .object({
    sessionId: sessionIdSchema,
    prompt: z.array(contentBlockSchema),
    _meta: acpMetaSchema.optional(),
  })
  .passthrough();
export type PromptRequest = z.infer<typeof promptRequestSchema>;

export const acpTranscriptSchema = z
  .object({
    sessionInfo: sessionInfoSchema,
    updates: z.array(sessionUpdateSchema),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type AcpTranscript = z.infer<typeof acpTranscriptSchema>;
