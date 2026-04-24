import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { parseSessionContent, parseSessionFile } from './parser.js';
import { serializeSession } from './serializer.js';
import { Platform, Session, SessionItem, createSessionId, normalizeTimestamp } from './types.js';
import { resolveOutputPath, writeTextFile } from '../utils/file-system.js';
import { deriveSessionItems } from './items.js';
import { buildAcpTranscriptFromSession, cloneAcpTranscript } from '../acp/transcript.js';
import { syncCodexSessionIndex } from '../platform/codex-state-sync.js';

export type ConversionRequest = {
  sourcePath: string;
  targetPlatform: Platform;
  outputDir?: string;
};

export type ConversionResult = {
  session: Session;
  outputPath: string;
  content: string;
};

function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

type SessionToolCall = NonNullable<Session['messages'][number]['toolCalls']>[number];

function getToolCallId(item: SessionItem): string {
  return item.toolCallId ?? item.callId ?? item.id;
}

function getToolCallStatus(item: SessionItem, existingStatus?: string): string | undefined {
  if (typeof existingStatus === 'string' && existingStatus) {
    return existingStatus;
  }

  if (item.isError === true) {
    return 'error';
  }

  if (item.isError === false) {
    return 'success';
  }

  const metadataStatus = item.metadata?.status;
  if (typeof metadataStatus === 'string' && metadataStatus) {
    if (metadataStatus === 'error' || metadataStatus === 'failed') {
      return 'error';
    }

    if (metadataStatus === 'success' || metadataStatus === 'completed') {
      return 'success';
    }
  }

  return undefined;
}

function normalizeToolResult(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : value;
  } catch {
    return value;
  }
}

function normalizeText(value: string | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function extractMessageParts(message: Session['messages'][number]): unknown[] {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const record = metadata as Record<string, unknown>;
  const nestedMessage =
    record.message && typeof record.message === 'object' ? (record.message as Record<string, unknown>) : undefined;
  const content = nestedMessage?.content ?? record.content;
  return Array.isArray(content) ? content : [];
}

function isStructuredToolResultPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') {
    return false;
  }

  const record = part as Record<string, unknown>;
  return record.type === 'tool_result' || 'functionResponse' in record;
}

function isStructuredToolCallPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') {
    return false;
  }

  const record = part as Record<string, unknown>;
  return record.type === 'tool_use' || 'functionCall' in record;
}

function isStandaloneToolResultMessage(message: Session['messages'][number]): boolean {
  if (message.role !== 'user' || (message.toolCalls?.length ?? 0) > 0 || message.attachments?.length) {
    return false;
  }

  const parts = extractMessageParts(message);
  return parts.length > 0 && parts.every(isStructuredToolResultPart);
}

function isStandaloneToolCallMessage(message: Session['messages'][number]): boolean {
  if (message.role !== 'assistant' || (message.toolCalls?.length ?? 0) === 0) {
    return false;
  }

  const parts = extractMessageParts(message);
  return parts.length > 0 && parts.every(isStructuredToolCallPart);
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getToolCallArgumentSummary(toolCall: SessionToolCall): string {
  const rawArguments = toolCall.arguments;
  if (!rawArguments) {
    return '';
  }

  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    if (typeof parsed === 'string') {
      return parsed.trim();
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return compactJson(parsed);
    }

    const record = parsed as Record<string, unknown>;
    const command = ['cmd', 'command', 'script', 'bash', 'shell', 'instruction']
      .map((key) => record[key])
      .find((value) => typeof value === 'string' && value.trim());
    if (typeof command === 'string') {
      return `command: ${command.trim()}`;
    }

    const pathValue = ['path', 'file', 'filepath', 'filename', 'cwd', 'directory', 'dir']
      .map((key) => record[key])
      .find((value) => typeof value === 'string' && value.trim());
    if (typeof pathValue === 'string') {
      return `path: ${pathValue.trim()}`;
    }

    const query = ['query', 'pattern', 'term', 'search', 'text', 'prompt']
      .map((key) => record[key])
      .find((value) => typeof value === 'string' && value.trim());
    if (typeof query === 'string') {
      return `query: ${query.trim()}`;
    }

    return compactJson(parsed);
  } catch {
    return rawArguments.trim();
  }
}

function ensureMessageStub(
  messages: Session['messages'],
  messageById: Map<string, Session['messages'][number]>,
  item: SessionItem,
  role: 'assistant' | 'user',
): Session['messages'][number] {
  const existing = messageById.get(item.messageId);
  if (existing) {
    return existing;
  }

  const message = {
    id: item.messageId,
    role,
    content: '',
    timestamp: item.timestamp,
    attachments: item.attachments ? deepClone(item.attachments) : undefined,
    metadata: item.metadata ? deepClone(item.metadata) : undefined,
  } as Session['messages'][number];

  messages.push(message);
  messageById.set(message.id, message);
  return message;
}

function upsertToolCall(
  message: Session['messages'][number],
  toolCall: SessionToolCall,
): SessionToolCall {
  const currentCalls = message.toolCalls ?? [];
  const existingIndex = currentCalls.findIndex((call) => call.id === toolCall.id);
  const existing = existingIndex >= 0 ? currentCalls[existingIndex] : undefined;
  const nextCall: SessionToolCall = {
    ...(existing ? deepClone(existing) : {}),
    ...deepClone(toolCall),
    id: toolCall.id,
    displayName: toolCall.displayName ?? toolCall.name,
    description: toolCall.description ?? existing?.description ?? getToolCallArgumentSummary(toolCall),
    renderOutputAsMarkdown: toolCall.renderOutputAsMarkdown ?? existing?.renderOutputAsMarkdown ?? true,
  };

  if (existingIndex >= 0) {
    currentCalls[existingIndex] = nextCall;
  } else {
    currentCalls.push(nextCall);
  }

  message.toolCalls = currentCalls;
  return nextCall;
}

function attachSessionItemsToMessages(messages: Session['messages'], items: SessionItem[]): Session['messages'] {
  const clonedMessages = messages.map((message) => deepClone(message));
  const messageById = new Map(clonedMessages.map((message) => [message.id, message]));
  const toolCallsById = new Map<string, { message: Session['messages'][number]; toolCall: SessionToolCall }>();
  const matchedToolResults = new Set<string>();

  for (const item of items) {
    if (item.kind !== 'tool_call') {
      continue;
    }

    const message = ensureMessageStub(clonedMessages, messageById, item, 'assistant');
    const nextCall = upsertToolCall(message, {
      id: getToolCallId(item),
      name: item.name ?? 'tool',
      arguments: item.arguments ?? '',
      status: getToolCallStatus(item),
    });

    toolCallsById.set(nextCall.id, { message, toolCall: nextCall });
  }

  for (const item of items) {
    if (item.kind !== 'tool_result') {
      continue;
    }

    const callId = getToolCallId(item);
    const matching = toolCallsById.get(callId);
    if (matching) {
      const normalizedResult = normalizeToolResult(item.result ?? item.content ?? matching.toolCall.result);
      const nextCall = upsertToolCall(matching.message, {
        ...matching.toolCall,
        result: normalizedResult ?? matching.toolCall.result,
        status: getToolCallStatus(item, matching.toolCall.status),
      });
      toolCallsById.set(nextCall.id, { message: matching.message, toolCall: nextCall });
      if (normalizedResult) {
        matchedToolResults.add(`${item.timestamp}::${normalizeText(normalizedResult)}`);
      }
      continue;
    }

    const message = ensureMessageStub(clonedMessages, messageById, item, 'user');
    message.content = normalizeToolResult(item.result ?? item.content) ?? '';
  }

  return clonedMessages.filter((message) => {
    if (!isStandaloneToolResultMessage(message)) {
      return true;
    }

    const signature = `${message.timestamp}::${normalizeText(message.content)}`;
    return !matchedToolResults.has(signature);
  });
}

function countVerifiableMessages(messages: Session['messages']): number {
  return messages.filter((message) => {
    if (isStandaloneToolResultMessage(message) || isStandaloneToolCallMessage(message)) {
      return false;
    }

    return normalizeText(message.content).length > 0;
  }).length;
}

function cloneSessionForPlatform(session: Session, targetPlatform: Platform): Session {
  const now = new Date().toISOString();
  const workspacePath =
    session.cwd ??
    (Array.isArray(session.metadata?.directories)
      ? session.metadata?.directories.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : undefined);
  const sessionId =
    targetPlatform === 'codex'
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id)
        ? session.id
        : uuidv4()
      : session.id || createSessionId(targetPlatform);
  const idPrefix = `${targetPlatform}-${sessionId}`;
  const metadata = {
    ...(session.metadata ? deepClone(session.metadata) : {}),
  } as Record<string, unknown>;
  const acpTranscript = session.acp
    ? cloneAcpTranscript(session.acp, sessionId)
    : cloneAcpTranscript(buildAcpTranscriptFromSession(session), sessionId);
  const sourceItems = deriveSessionItems({ ...session, acp: acpTranscript });
  const clonedItems: SessionItem[] = sourceItems.map((item, index) => ({
    ...item,
    id: item.id || `${idPrefix}-item-${index}-${uuidv4()}`,
    messageId: item.messageId || `${idPrefix}-message-${index}`,
    timestamp: normalizeTimestamp(item.timestamp, new Date()),
    metadata: item.metadata ? deepClone(item.metadata) : undefined,
  }));

  if (workspacePath) {
    if (targetPlatform === 'claude-code' || targetPlatform === 'codex') {
      metadata.cwd = workspacePath;
    }

    if (targetPlatform === 'gemini') {
      metadata.projectHash = createHash('sha256').update(workspacePath).digest('hex');
    }
  }

  if (targetPlatform === 'gemini' && metadata.kind === 'main') {
    delete metadata.kind;
  }

  if (targetPlatform === 'codex') {
    metadata.originator = 'Codex Desktop';
    metadata.source = 'vscode';
  }

  return {
    ...session,
    id: sessionId,
    platform: targetPlatform,
    sourcePlatform: session.sourcePlatform ?? session.platform,
    sourceFormat: session.sourceFormat,
    createdAt: normalizeTimestamp(session.createdAt, new Date()),
    updatedAt: now,
    cwd: workspacePath ?? session.cwd,
    metadata,
    items: clonedItems,
    acp: acpTranscript,
    rawContent: undefined,
    rawRecords: undefined,
    nativeMetadata: {
      sourcePlatform: session.sourcePlatform ?? session.platform,
      sourceFormat: session.sourceFormat,
      sourceNativeMetadata: session.nativeMetadata,
    },
    isNativeUnchanged: false,
    messages: attachSessionItemsToMessages(
      session.messages.map((message, index) => ({
        ...deepClone(message),
        id: message.id || `${idPrefix}-message-${index}-${uuidv4()}`,
        timestamp: normalizeTimestamp(message.timestamp, new Date()),
        toolCalls: message.toolCalls?.map((toolCall, toolIndex) => ({
          ...deepClone(toolCall),
          id: toolCall.id || `${idPrefix}-tool-${index}-${toolIndex}-${uuidv4()}`,
          displayName: toolCall.displayName ?? toolCall.name,
          description: toolCall.description ?? getToolCallArgumentSummary(toolCall),
          renderOutputAsMarkdown: toolCall.renderOutputAsMarkdown ?? true,
        })),
      })),
      clonedItems,
    ),
  };
}

export async function convertSession(sourceSession: Session, targetPlatform: Platform): Promise<Session> {
  return cloneSessionForPlatform(sourceSession, targetPlatform);
}

export async function convertSessionFile(request: ConversionRequest): Promise<ConversionResult> {
  const source = await parseSessionFile(request.sourcePath);
  const converted = await convertSession(source.session, request.targetPlatform);
  const serialized = await serializeSession(converted, request.targetPlatform);
  const outputPath = await resolveOutputPath(
    request.sourcePath,
    converted,
    request.targetPlatform,
    serialized.extension,
    request.outputDir,
  );
  const verification = await parseSessionContent(serialized.content, outputPath);
  if (verification.session.platform !== request.targetPlatform) {
    throw new Error(`Verification failed for ${request.targetPlatform} output`);
  }
  if (verification.session.messages.length < countVerifiableMessages(converted.messages)) {
    throw new Error(`Verification failed for ${request.targetPlatform} output message count`);
  }
  if ((converted.items?.length ?? 0) > 0 && (verification.session.items?.length ?? 0) < (converted.items?.length ?? 0)) {
    throw new Error(`Verification failed for ${request.targetPlatform} output item count`);
  }
  if (request.targetPlatform === 'gemini' && deriveSessionItems(converted).some((item) => item.kind === 'tool_call')) {
    const geminiOutput = JSON.parse(serialized.content) as {
      messages?: Array<{
        type?: unknown;
        toolCalls?: Array<{
          displayName?: unknown;
          description?: unknown;
        }>;
      }>;
    };
    const hasRenderableToolCalls = (geminiOutput.messages ?? []).some(
      (message) => message.type === 'gemini' && Array.isArray(message.toolCalls) && message.toolCalls.length > 0,
    );
    if (!hasRenderableToolCalls) {
      throw new Error('Verification failed for Gemini output tool call rendering metadata');
    }
    const hasVisibleToolHeaders = (geminiOutput.messages ?? []).some((message) =>
      Array.isArray(message.toolCalls)
        ? message.toolCalls.some(
            (toolCall) =>
              typeof toolCall.displayName === 'string' &&
              toolCall.displayName.trim().length > 0 &&
              typeof toolCall.description === 'string' &&
              toolCall.description.trim().length > 0,
          )
        : false,
    );
    if (!hasVisibleToolHeaders) {
      throw new Error('Verification failed for Gemini output tool header metadata');
    }
  }
  await writeTextFile(outputPath, serialized.content);
  if (request.targetPlatform === 'codex') {
    await syncCodexSessionIndex(converted, outputPath);
  }

  return {
    session: converted,
    outputPath,
    content: serialized.content,
  };
}
