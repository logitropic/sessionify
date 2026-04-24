import { ParseResult, Session, SessionFormat, SessionItem } from '../session/types.js';
import { ensureSession } from '../session/parser.js';
import { normalizeTimestamp } from '../session/types.js';

type GeminiSessionRecord = {
  sessionId?: string;
  startTime?: string;
  lastUpdated?: string;
  summary?: string;
  directories?: string[];
  messages?: Array<Record<string, unknown>>;
  kind?: string;
  [key: string]: unknown;
};

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }

        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text?: unknown }).text ?? '');
  }

  return '';
}

function stringifyArgs(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return '';
}

function getToolCallId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function extractFunctionResponseOutput(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((part) => extractFunctionResponseOutput(part)).filter(Boolean).join('\n');
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  if ('functionResponse' in record && record.functionResponse && typeof record.functionResponse === 'object') {
    const functionResponse = record.functionResponse as Record<string, unknown>;
    const response = functionResponse.response;
    if (response && typeof response === 'object') {
      const responseRecord = response as Record<string, unknown>;
      const output = responseRecord.output;
      if (typeof output === 'string') {
        return output;
      }
      return stringifyArgs(output ?? response);
    }
  }

  if ('text' in record && typeof record.text === 'string') {
    return record.text;
  }

  return stringifyArgs(value);
}

function getGeminiToolResult(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const output = extractFunctionResponseOutput(value);
  return output || undefined;
}

function getGeminiMessageParts(message: Record<string, unknown>): unknown {
  if (Array.isArray(message.content)) {
    return message.content;
  }

  if (Array.isArray(message.displayContent)) {
    return message.displayContent;
  }

  return message.content ?? message.displayContent ?? [];
}

function extractFirstJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseGeminiParts(
  messageId: string,
  parts: unknown,
  role: 'user' | 'assistant' | 'system',
  timestamp: string,
  metadata: Record<string, unknown>,
): { summary: string; items: SessionItem[] } {
  const items: SessionItem[] = [];
  const summaryParts: string[] = [];
  const partArray = Array.isArray(parts) ? parts : parts ? [parts] : [];

  for (const [index, part] of partArray.entries()) {
    if (typeof part === 'string') {
      if (part.trim()) {
        summaryParts.push(part);
        items.push({
          id: `${messageId}-text-${index}`,
          kind: 'text',
          messageId,
          sequence: index,
          role,
          content: part,
          timestamp,
          metadata,
        });
      }
      continue;
    }

    if (!part || typeof part !== 'object') {
      continue;
    }

    const value = part as Record<string, unknown>;

    if (typeof value.text === 'string' && !value.functionCall && !value.functionResponse) {
      summaryParts.push(value.text);
      items.push({
        id: `${messageId}-text-${index}`,
        kind: 'text',
        messageId,
        sequence: index,
        role,
        content: value.text,
        timestamp,
        metadata,
      });
      continue;
    }

    if (value.thought === true || typeof value.thought === 'string') {
      const text = typeof value.text === 'string' ? value.text : String(value.thought ?? '');
      summaryParts.push(text);
      items.push({
        id: `${messageId}-thinking-${index}`,
        kind: 'reasoning',
        messageId,
        sequence: index,
        role: 'assistant',
        content: text,
        timestamp,
        metadata,
      });
      continue;
    }

    if (value.functionCall) {
      const functionCall = value.functionCall as Record<string, unknown>;
      const name = typeof functionCall.name === 'string' && functionCall.name ? functionCall.name : 'tool';
      const args = stringifyArgs(functionCall.args);
      const callId = getToolCallId(functionCall.id, `${messageId}-tool-${index}`);
      summaryParts.push(`[function_call] ${name}`);
      items.push({
        id: `${messageId}-tool-${index}`,
        kind: 'tool_call',
        messageId,
        sequence: index,
        role: 'assistant',
        content: `[function_call] ${name}`,
        name,
        toolCallId: callId,
        callId,
        arguments: args,
        timestamp,
        metadata,
      });
      continue;
    }

    if (value.functionResponse) {
      const functionResponse = value.functionResponse as Record<string, unknown>;
      const name = typeof functionResponse.name === 'string' && functionResponse.name ? functionResponse.name : 'tool';
      const callId = getToolCallId(functionResponse.id, `${messageId}-tool-${index}`);
      const output = functionResponse.response && typeof functionResponse.response === 'object'
        ? stringifyArgs((functionResponse.response as Record<string, unknown>).output ?? functionResponse.response)
        : stringifyArgs(functionResponse.response);
      summaryParts.push(output || `[function_response] ${name}`);
      items.push({
        id: `${messageId}-tool-result-${index}`,
        kind: 'tool_result',
        messageId: `${callId}-result`,
        sequence: index,
        role: 'user',
        content: output,
        result: output,
        name,
        toolCallId: callId,
        callId,
        timestamp,
        metadata,
      });
      continue;
    }
  }

  return {
    summary: summaryParts.filter(Boolean).join('\n'),
    items,
  };
}

function toolCallToItems(
  messageId: string,
  toolCall: Record<string, unknown>,
  timestamp: string,
  metadata: Record<string, unknown>,
): SessionItem[] {
  const callId = getToolCallId(toolCall.id, `${messageId}-tool`);
  const name = typeof toolCall.name === 'string' && toolCall.name ? toolCall.name : 'tool';
  const args = stringifyArgs(toolCall.args);
  const items: SessionItem[] = [
    {
      id: `${messageId}-tool-${callId}`,
      kind: 'tool_call',
      messageId,
      sequence: 0,
      role: 'assistant',
      name,
      toolCallId: callId,
      callId,
      content: `[function_call] ${name}`,
      arguments: args,
      timestamp,
      metadata,
    },
  ];

  const result = toolCall.result;
  if (result !== undefined && result !== null) {
    const output = Array.isArray(result)
      ? result.map((part) => extractFunctionResponseOutput(part)).filter(Boolean).join('\n')
      : extractFunctionResponseOutput(result);
    items.push({
      id: `${messageId}-tool-result-${callId}`,
      kind: 'tool_result',
      messageId: `${callId}-result`,
      sequence: 1,
      role: 'user',
      name,
      toolCallId: callId,
      callId,
      isError: typeof toolCall.status === 'string' ? toolCall.status === 'error' || toolCall.status === 'failed' : undefined,
      result: output,
      content: output,
      timestamp,
      metadata,
    });
  }

  return items;
}

function toolItemsToToolCalls(items: SessionItem[]): NonNullable<Session['messages'][number]['toolCalls']> {
  const resultsByCallId = new Map<string, SessionItem>();

  for (const item of items) {
    if (item.kind === 'tool_result' && (item.toolCallId ?? item.callId)) {
      resultsByCallId.set(item.toolCallId ?? item.callId ?? item.id, item);
    }
  }

  return items
    .filter((item): item is SessionItem & { kind: 'tool_call' } => item.kind === 'tool_call')
    .map((item) => {
      const callId = item.toolCallId ?? item.callId ?? item.id;
      const resultItem = resultsByCallId.get(callId);
      return {
        id: callId,
        namespace: typeof item.metadata?.namespace === 'string' && item.metadata.namespace ? item.metadata.namespace : undefined,
        name: item.name ?? 'tool',
        arguments: item.arguments ?? '{}',
        result: typeof resultItem?.result === 'string' ? resultItem.result : resultItem?.content,
        status: resultItem ? 'success' : 'executing',
        displayName: item.name ?? 'tool',
        description: '',
        renderOutputAsMarkdown: true,
        resultDisplay: resultItem?.result ?? resultItem?.content ?? '',
      };
    });
}

function mergeToolCalls(
  parsedToolCalls: NonNullable<Session['messages'][number]['toolCalls']>,
  metadataToolCalls: NonNullable<Session['messages'][number]['toolCalls']>,
): NonNullable<Session['messages'][number]['toolCalls']> {
  if (metadataToolCalls.length === 0) {
    return parsedToolCalls;
  }

  const parsedById = new Map(parsedToolCalls.map((toolCall) => [toolCall.id, toolCall]));
  const merged = metadataToolCalls.map((toolCall) => {
    const parsed = parsedById.get(toolCall.id);
    if (!parsed) {
      return toolCall;
    }

    return {
      ...toolCall,
      ...parsed,
      result: parsed.result ?? toolCall.result,
      status: (parsed.result ?? toolCall.result) ? 'success' : (parsed.status ?? toolCall.status),
      displayName: toolCall.displayName ?? parsed.displayName ?? parsed.name,
      description: toolCall.description ?? parsed.description,
      renderOutputAsMarkdown: toolCall.renderOutputAsMarkdown ?? parsed.renderOutputAsMarkdown,
      resultDisplay: parsed.resultDisplay ?? toolCall.resultDisplay ?? parsed.result ?? toolCall.result ?? '',
    };
  });

  const mergedIds = new Set(merged.map((toolCall) => toolCall.id));
  for (const toolCall of parsedToolCalls) {
    if (!mergedIds.has(toolCall.id)) {
      merged.push(toolCall);
    }
  }

  return merged;
}

export async function parseGeminiSession(content: string, _sourcePath?: string): Promise<ParseResult> {
  let record: GeminiSessionRecord;
  try {
    record = JSON.parse(content) as GeminiSessionRecord;
  } catch (error) {
    const fallback = extractFirstJsonObject(content);
    if (!fallback) {
      throw new Error(`Invalid Gemini session JSON: ${(error as Error).message}`, { cause: error });
    }

    try {
      record = JSON.parse(fallback) as GeminiSessionRecord;
    } catch (fallbackError) {
      throw new Error(`Invalid Gemini session JSON: ${(fallbackError as Error).message}`, { cause: fallbackError });
    }
  }
  const sessionId = typeof record.sessionId === 'string' && record.sessionId ? record.sessionId : `gemini-${crypto.randomUUID()}`;
  const messages = (record.messages ?? []).map((message, index) => {
    const type = message.type;
    const role = (type === 'user' ? 'user' : type === 'gemini' ? 'assistant' : 'system') as
      | 'user'
      | 'assistant'
      | 'system';
    const messageId = typeof message.id === 'string' && message.id ? message.id : `${sessionId}-message-${index}`;
    const parts = getGeminiMessageParts(message);
    const parsed = parseGeminiParts(
      messageId,
      parts,
      role,
      normalizeTimestamp(typeof message.timestamp === 'string' ? message.timestamp : record.startTime),
      message,
    );
    const parsedToolCalls = toolItemsToToolCalls(parsed.items);
    const metadataToolCalls = Array.isArray(message.toolCalls)
      ? message.toolCalls.map((toolCall, toolCallIndex) => ({
          id: getToolCallId(toolCall.id, `${messageId}-tool-${toolCallIndex}`),
          namespace: typeof toolCall.namespace === 'string' && toolCall.namespace ? toolCall.namespace : undefined,
          name: typeof toolCall.name === 'string' && toolCall.name ? toolCall.name : 'tool',
          arguments: JSON.stringify(toolCall.args ?? {}),
          result: getGeminiToolResult(toolCall.result),
          status: typeof toolCall.status === 'string' ? toolCall.status : undefined,
          displayName: typeof toolCall.displayName === 'string' ? toolCall.displayName : undefined,
          description: typeof toolCall.description === 'string' ? toolCall.description : undefined,
          renderOutputAsMarkdown: typeof toolCall.renderOutputAsMarkdown === 'boolean' ? toolCall.renderOutputAsMarkdown : undefined,
          resultDisplay: toolCall.resultDisplay,
        }))
      : [];
    const toolCalls = mergeToolCalls(parsedToolCalls, metadataToolCalls);
    const fallbackText = extractText(parts);
    const toolSummary =
      toolCalls.length > 0 ? toolCalls.map((toolCall) => `[function_call] ${toolCall.name}`).join('\n') : '';

    return {
      id: messageId,
      role,
      content: parsed.summary || fallbackText || toolSummary,
      timestamp: normalizeTimestamp(typeof message.timestamp === 'string' ? message.timestamp : record.startTime),
      attachments: undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      metadata: message,
    };
  });
  const items = (record.messages ?? []).flatMap((message, index) => {
    const type = message.type;
    const role = (type === 'user' ? 'user' : type === 'gemini' ? 'assistant' : 'system') as
      | 'user'
      | 'assistant'
      | 'system';
    const messageId = typeof message.id === 'string' && message.id ? message.id : `${sessionId}-message-${index}`;
    const parts = getGeminiMessageParts(message);
    const parsed = parseGeminiParts(
      messageId,
      parts,
      role,
      normalizeTimestamp(typeof message.timestamp === 'string' ? message.timestamp : record.startTime),
      message,
    );
    const toolItems = Array.isArray(message.toolCalls)
      ? message.toolCalls.flatMap((toolCall) =>
          toolCall && typeof toolCall === 'object'
            ? toolCallToItems(
                messageId,
                toolCall as Record<string, unknown>,
                normalizeTimestamp(typeof message.timestamp === 'string' ? message.timestamp : record.startTime),
                message,
              )
            : [],
        )
      : [];

    const existingCallIds = new Set(
      parsed.items
        .filter((item) => item.kind === 'tool_call' || item.kind === 'tool_result')
        .map((item) => item.toolCallId ?? item.callId)
        .filter((id): id is string => Boolean(id)),
    );
    const filteredToolItems = toolItems.filter((item) => !item.toolCallId || !existingCallIds.has(item.toolCallId));

    return [...parsed.items, ...filteredToolItems];
  });

  const session: Session = ensureSession({
    id: sessionId,
    platform: 'gemini',
    sourcePlatform: 'gemini',
    sourceFormat: { type: 'gemini', variant: 'json' },
    createdAt: normalizeTimestamp(record.startTime, new Date()),
    updatedAt: normalizeTimestamp(record.lastUpdated ?? record.startTime, new Date()),
    title: typeof record.summary === 'string' ? record.summary : undefined,
    messages,
    items,
    rawContent: content,
    rawRecords: [record],
    nativeMetadata: record,
    isNativeUnchanged: true,
    metadata: record,
  });

  const format: SessionFormat = { type: 'gemini', variant: 'json' };
  return { session, raw: record, format };
}
