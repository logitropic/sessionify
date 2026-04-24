import { SerializeResult, Session, SessionItem } from '../session/types.js';
import { deriveSessionItems, groupSessionItems } from '../session/items.js';

function parseArgs(value: string | undefined): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function textParts(content: string | undefined): Array<Record<string, unknown>> {
  return content && content.trim() ? [{ text: content }] : [];
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseItemArgs(value: string | undefined): unknown {
  return parseArgs(value);
}

function toolArgValue(args: unknown, keys: string[]): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return undefined;
  }

  const record = args as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }

  return undefined;
}

function summarizeToolArgs(name: string, args: unknown): string {
  if (typeof args === 'string') {
    const trimmed = args.trim();
    if (!trimmed) {
      return '';
    }

    try {
      return summarizeToolArgs(name, JSON.parse(trimmed));
    } catch {
      return trimmed.includes('\n') ? trimmed.split('\n', 1)[0] ?? trimmed : trimmed;
    }
  }

  if (!args || typeof args !== 'object') {
    return '';
  }

  const normalizedName = name.toLowerCase();
  const command =
    toolArgValue(args, ['cmd', 'command', 'script', 'bash', 'shell', 'instruction']) ??
    undefined;
  const pathValue =
    toolArgValue(args, ['path', 'file', 'filepath', 'filename', 'cwd', 'directory', 'dir']) ??
    undefined;
  const query =
    toolArgValue(args, ['query', 'pattern', 'term', 'search', 'text', 'prompt']) ??
    undefined;

  if (normalizedName.includes('exec') || normalizedName === 'bash' || normalizedName.includes('shell')) {
    if (command) {
      return `command: ${command}`;
    }
    if (pathValue) {
      return `path: ${pathValue}`;
    }
  }

  if (normalizedName === 'read' || normalizedName.includes('read')) {
    if (pathValue) {
      return `path: ${pathValue}`;
    }
  }

  if (normalizedName === 'write' || normalizedName.includes('write') || normalizedName.includes('edit')) {
    if (pathValue && command) {
      return `path: ${pathValue}; content: ${command}`;
    }
    if (pathValue) {
      return `path: ${pathValue}`;
    }
    if (command) {
      return `content: ${command}`;
    }
  }

  if (normalizedName.includes('search') || normalizedName.includes('grep') || normalizedName.includes('glob')) {
    if (query) {
      return `query: ${query}`;
    }
    if (pathValue) {
      return `path: ${pathValue}`;
    }
  }

  const compact = compactJson(args);
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

function toolDisplayName(name: string, metadata?: Record<string, unknown>): string {
  const displayName = metadata?.displayName;
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim();
  }

  return name || 'tool';
}

function toolDescription(name: string, args: unknown, metadata?: Record<string, unknown>): string {
  const description = metadata?.description;
  if (typeof description === 'string' && description.trim()) {
    return description.trim();
  }

  const summary = summarizeToolArgs(name, args);
  if (summary) {
    return summary;
  }

  return '';
}

function normalizeToolResultText(value: unknown): string {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // Keep non-JSON tool output as-is.
    }

    return value;
  }

  if (value === undefined || value === null) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toolResultParts(id: string, name: string, output: unknown): Array<Record<string, unknown>> {
  return [
    {
      functionResponse: {
        id,
        name,
        response: {
          output: normalizeToolResultText(output),
        },
      },
    },
  ];
}

function getGeminiToolStatus(item: SessionItem, result?: SessionItem): string {
  if (result?.isError === true || item.isError === true) {
    return 'error';
  }

  const status = result?.metadata?.status ?? item.metadata?.status;
  if (typeof status === 'string') {
    if (status === 'error' || status === 'failed') {
      return 'error';
    }

    if (status === 'success' || status === 'completed') {
      return 'success';
    }
  }

  return result || item.result !== undefined ? 'success' : 'executing';
}

function itemToolCallRecord(item: SessionItem, result?: SessionItem): Record<string, unknown> {
  const name = item.name ?? 'tool';
  const id = item.toolCallId ?? item.callId ?? item.id;
  const output = result?.result ?? result?.content ?? item.result;
  const resultDisplay = result?.metadata?.resultDisplay ?? item.metadata?.resultDisplay ?? output;
  const metadata = result?.metadata ?? item.metadata;
  const args = parseItemArgs(item.arguments);
  const displayName = toolDisplayName(name, metadata);
  const description = toolDescription(name, args, metadata);
  const renderOutputAsMarkdown =
    typeof item.metadata?.renderOutputAsMarkdown === 'boolean'
      ? item.metadata.renderOutputAsMarkdown
      : typeof result?.metadata?.renderOutputAsMarkdown === 'boolean'
        ? result.metadata.renderOutputAsMarkdown
        : true;

  return {
    id,
    name,
    args,
    status: getGeminiToolStatus(item, result),
    timestamp: result?.timestamp ?? item.timestamp,
    displayName,
    description,
    renderOutputAsMarkdown,
    ...(output !== undefined && output !== null ? { result: toolResultParts(id, name, output) } : {}),
    ...(resultDisplay !== undefined && resultDisplay !== null ? { resultDisplay } : {}),
  };
}

function messageToolCallRecord(
  toolCall: NonNullable<Session['messages'][number]['toolCalls']>[number],
  timestamp: string,
): Record<string, unknown> {
  const resultDisplay = toolCall.resultDisplay ?? toolCall.result;
  const args = parseArgs(toolCall.arguments);

  return {
    id: toolCall.id,
    name: toolCall.name,
    args,
    status: toolCall.status === 'error' || toolCall.status === 'failed' ? 'error' : toolCall.result !== undefined ? 'success' : 'executing',
    timestamp,
    displayName: toolDisplayName(toolCall.name, toolCall),
    description: toolDescription(toolCall.name, args, toolCall),
    renderOutputAsMarkdown: toolCall.renderOutputAsMarkdown ?? true,
    ...(toolCall.result !== undefined && toolCall.result !== null
      ? { result: toolResultParts(toolCall.id, toolCall.name, toolCall.result) }
      : {}),
    ...(resultDisplay !== undefined && resultDisplay !== null ? { resultDisplay } : {}),
  };
}

function getGeminiMetadata(metadata: Record<string, unknown>, session: Session): Record<string, unknown> {
  const tokens = metadata.tokens && typeof metadata.tokens === 'object' ? metadata.tokens : undefined;
  const model =
    typeof metadata.model === 'string'
      ? metadata.model
      : session.metadata?.model && typeof session.metadata.model === 'string'
        ? session.metadata.model
        : undefined;

  return {
    ...(tokens ? { tokens } : {}),
    ...(model ? { model } : {}),
  };
}

function normalizeThoughts(thoughts: string[], metadata: Record<string, unknown>): Record<string, unknown> {
  const metadataThoughts = Array.isArray(metadata.thoughts) ? metadata.thoughts : undefined;
  if (thoughts.length > 0) {
    return { thoughts: thoughts.map((description) => ({ subject: '', description, timestamp: new Date(0).toISOString() })) };
  }

  if (metadataThoughts) {
    return { thoughts: metadataThoughts };
  }

  return {};
}

function isToolResultOnlyMessage(message: Session['messages'][number]): boolean {
  if (message.role !== 'user' || (message.toolCalls?.length ?? 0) > 0 || message.attachments?.length) {
    return false;
  }

  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  const nestedMessage =
    record.message && typeof record.message === 'object' ? (record.message as Record<string, unknown>) : undefined;
  const content = nestedMessage?.content ?? record.content;
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }

  return content.every((part) => part && typeof part === 'object' && 'functionResponse' in (part as Record<string, unknown>));
}

export async function serializeGeminiSession(session: Session): Promise<SerializeResult> {
  const messages: Array<Record<string, unknown>> = [];
  const items = deriveSessionItems(session);
  const groupedItems = groupSessionItems(items);
  const messageById = new Map(session.messages.map((message) => [message.id, message]));
  const consumedMessageIds = new Set<string>();
  const toolResultsById = new Map(
    items
      .filter((item) => item.kind === 'tool_result')
      .map((item) => [item.toolCallId ?? item.callId ?? item.id, item]),
  );

  groupedItems.forEach((group, index) => {
    const first = group[0];
    if (!first) {
      return;
    }

    const toolCalls = group.filter((item) => item.kind === 'tool_call');
    if (toolCalls.length === 0 && group.every((item) => item.kind === 'tool_result')) {
      return;
    }

    const sourceMessage = messageById.get(first.messageId);
    if (sourceMessage) {
      consumedMessageIds.add(sourceMessage.id);
    }

    const role = sourceMessage?.role ?? first.role ?? (group.some((item) => item.kind === 'tool_call') ? 'assistant' : 'user');
    const metadata = sourceMessage?.metadata ?? first.metadata ?? {};
    const text = group
      .filter((item) => item.kind === 'text')
      .map((item) => item.content ?? '')
      .filter((value) => value.trim())
      .join('\n');
    const thoughts = group
      .filter((item) => item.kind === 'reasoning')
      .map((item) => item.content ?? '')
      .filter((value) => value.trim());
    const content = [
      ...textParts(text || sourceMessage?.content),
    ];
    const base = {
      id: sourceMessage?.id ?? first.messageId ?? `${session.id}-message-${index}`,
      timestamp: sourceMessage?.timestamp ?? first.timestamp,
      content,
    };

    if (role === 'user') {
      messages.push({
        ...base,
        type: 'user' as const,
      });
      return;
    }

    if (role === 'system') {
      messages.push({
        ...base,
        type: 'info' as const,
      });
      return;
    }

    const geminiToolCalls = toolCalls.map((item) =>
      itemToolCallRecord(item, toolResultsById.get(item.toolCallId ?? item.callId ?? item.id)),
    );

    messages.push({
      ...base,
      type: 'gemini' as const,
      ...normalizeThoughts(thoughts, metadata),
      ...getGeminiMetadata(metadata, session),
      ...(geminiToolCalls.length > 0 ? { toolCalls: geminiToolCalls } : {}),
    });
  });

  session.messages
    .filter((message) => !consumedMessageIds.has(message.id))
    .forEach((message, index) => {
      if (isToolResultOnlyMessage(message)) {
        return;
      }

      const id = message.id || `${session.id}-message-${index}`;
      const metadata = message.metadata ?? {};
      const isGeminiMessage = message.role !== 'user' && message.role !== 'system';
      const content = textParts(message.content);
      const base = {
        id,
        timestamp: message.timestamp,
        content,
      };

      if (message.role === 'user') {
        messages.push({
          ...base,
          type: 'user' as const,
        });
        return;
      }

      if (message.role === 'system') {
        messages.push({
          ...base,
          type: 'info' as const,
        });
        return;
      }

      const geminiToolCalls = isGeminiMessage
        ? (message.toolCalls ?? []).map((toolCall) => messageToolCallRecord(toolCall, message.timestamp))
        : [];

      messages.push({
        ...base,
        type: 'gemini' as const,
        ...normalizeThoughts([], metadata),
        ...getGeminiMetadata(metadata, session),
        ...(geminiToolCalls.length > 0 ? { toolCalls: geminiToolCalls } : {}),
      });
    });

  const payload = {
    sessionId: session.id,
    projectHash: session.metadata?.projectHash ?? '',
    startTime: session.createdAt,
    lastUpdated: session.updatedAt,
    ...(session.title ? { summary: session.title } : {}),
    ...(Array.isArray(session.metadata?.directories) && session.metadata.directories.length > 0
      ? { directories: session.metadata.directories }
      : {}),
    ...(typeof session.metadata?.kind === 'string' ? { kind: session.metadata.kind } : {}),
    messages,
  };

  return {
    content: `${JSON.stringify(payload, null, 2)}\n`,
    platform: 'gemini',
    format: { type: 'gemini', variant: 'json' },
    extension: 'json',
  };
}
