import { z } from 'zod';
import { acpTranscriptSchema } from '../acp/schema.js';

export const platformSchema = z.enum(['claude-code', 'codex', 'gemini']);
export type Platform = z.infer<typeof platformSchema>;

export const sessionFormatSchema = z.union([
  z.object({ type: z.literal('claude-code'), variant: z.literal('ndjson') }),
  z.object({ type: z.literal('codex'), variant: z.literal('jsonl') }),
  z.object({ type: z.literal('gemini'), variant: z.literal('json') }),
]);
export type SessionFormat = z.infer<typeof sessionFormatSchema>;

export const roleSchema = z.enum(['user', 'assistant', 'system']);
export type Role = z.infer<typeof roleSchema>;

export const sessionItemKindSchema = z.enum(['text', 'tool_call', 'tool_result', 'reasoning']);
export type SessionItemKind = z.infer<typeof sessionItemKindSchema>;

export const toolCallSchema = z.object({
  id: z.string().min(1),
  namespace: z.string().optional(),
  name: z.string().min(1),
  arguments: z.string(),
  result: z.string().optional(),
  status: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  renderOutputAsMarkdown: z.boolean().optional(),
  resultDisplay: z.unknown().optional(),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const sessionItemSchema = z.object({
  id: z.string().min(1),
  kind: sessionItemKindSchema,
  messageId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  role: roleSchema.optional(),
  content: z.string().optional(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
  callId: z.string().optional(),
  arguments: z.string().optional(),
  result: z.string().optional(),
  isError: z.boolean().optional(),
  attachments: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().min(1),
});
export type SessionItem = z.infer<typeof sessionItemSchema>;

export const messageSchema = z.object({
  id: z.string().min(1),
  role: roleSchema,
  content: z.string(),
  timestamp: z.string().min(1),
  attachments: z.array(z.string()).optional(),
  toolCalls: z.array(toolCallSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Message = z.infer<typeof messageSchema>;
export type SessionMessage = Message;

export const sessionSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  sourcePlatform: platformSchema.optional(),
  sourceFormat: sessionFormatSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  title: z.string().optional(),
  cwd: z.string().optional(),
  messages: z.array(messageSchema).min(1),
  items: z.array(sessionItemSchema).optional(),
  acp: acpTranscriptSchema.optional(),
  rawContent: z.string().optional(),
  rawRecords: z.array(z.unknown()).optional(),
  nativeMetadata: z.record(z.string(), z.unknown()).optional(),
  isNativeUnchanged: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionFileSchema = z.object({
  path: z.string().min(1),
  platform: platformSchema,
  format: sessionFormatSchema,
  size: z.number().nonnegative(),
  modifiedAt: z.date(),
  sessionId: z.string().min(1),
});
export type SessionFile = z.infer<typeof sessionFileSchema>;

export type DetectionResult = {
  platform: Platform;
  format: SessionFormat;
  confidence: number;
};

export type ParseResult = {
  session: Session;
  raw: unknown;
  format: SessionFormat;
};

export type SerializeResult = {
  content: string;
  platform: Platform;
  format: SessionFormat;
  extension: string;
};
export function createSessionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeTimestamp(value: string | Date | undefined, fallback = new Date()): string {
  if (!value) {
    return fallback.toISOString();
  }

  const parsed = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}
