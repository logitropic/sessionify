import { ParseResult, Session, SessionFormat, SessionItem } from '../session/types.js';
import { ensureSession } from '../session/parser.js';
import { normalizeTimestamp } from '../session/types.js';
import path from 'node:path';

type ClaudeCodeLine = Record<string, unknown> & {
  sessionId?: string;
  timestamp?: string;
  created?: string;
  modified?: string;
  cwd?: string;
  firstPrompt?: string;
  title?: string;
  messages?: unknown[];
  message?: unknown;
  content?: unknown;
  text?: unknown;
  type?: unknown;
  isMeta?: unknown;
};

function parseJsonLines(content: string): ClaudeCodeLine[] {
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ClaudeCodeLine];
      } catch {
        return [];
      }
    });
}

function extractContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(extractContent).filter(Boolean).join('\n');
  }

  if (content && typeof content === 'object') {
    const value = content as Record<string, unknown>;

    if (typeof value.text === 'string') {
      return value.text;
    }

    if (typeof value.thinking === 'string') {
      return value.thinking;
    }

    if (typeof value.output === 'string') {
      return value.output;
    }

    if (typeof value.result === 'string') {
      return value.result;
    }

    if (value.type === 'tool_use') {
      const name = typeof value.name === 'string' && value.name ? value.name : 'tool';
      const input = value.input ?? value.arguments;
      const args = input && typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input ?? '');
      return [name, args].filter(Boolean).join('\n');
    }

    if (value.type === 'tool_result') {
      return extractContent(value.content ?? value.result ?? value.output);
    }

    if (value.type === 'thinking' || value.type === 'redacted_thinking') {
      return typeof value.thinking === 'string' ? value.thinking : '';
    }

    if ('content' in value) {
      return extractContent(value.content);
    }

    if ('message' in value) {
      return extractContent(value.message);
    }

    if ('text' in value) {
      return String(value.text ?? '');
    }
  }

  return '';
}

type ParsedClaudeMessage = {
  message: Session['messages'][number];
  items: SessionItem[];
};

function stringifyArguments(value: unknown): string {
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

function parseClaudeContent(
  content: unknown,
  messageId: string,
  role: 'user' | 'assistant' | 'system',
  timestamp: string,
  baseMetadata: Record<string, unknown>,
): { summary: string; items: SessionItem[] } {
  const items: SessionItem[] = [];
  const summaryParts: string[] = [];
  let toolCounter = 0;

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.trim()) {
        summaryParts.push(value);
        items.push({
          id: `${messageId}-text-${items.length}`,
          kind: 'text',
          messageId,
          sequence: items.length,
          role,
          content: value,
          timestamp,
          metadata: baseMetadata,
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const block = value as Record<string, unknown>;

    if (typeof block.text === 'string' && block.type !== 'tool_use' && block.type !== 'tool_result') {
      summaryParts.push(block.text);
      items.push({
        id: `${messageId}-text-${items.length}`,
        kind: 'text',
        messageId,
        sequence: items.length,
        role,
        content: block.text,
        timestamp,
        metadata: baseMetadata,
      });
      return;
    }

    if (typeof block.thinking === 'string') {
      summaryParts.push(block.thinking);
      items.push({
        id: `${messageId}-thinking-${items.length}`,
        kind: 'reasoning',
        messageId,
        sequence: items.length,
        role: 'assistant',
        content: block.thinking,
        timestamp,
        metadata: baseMetadata,
      });
      return;
    }

    if (block.type === 'tool_use') {
      const toolIndex = toolCounter++;
      const toolCallId = typeof block.id === 'string' && block.id ? block.id : `${messageId}-tool-${toolIndex}`;
      const name = typeof block.name === 'string' && block.name ? block.name : 'tool';
      const input = stringifyArguments(block.input ?? block.arguments);
      summaryParts.push(`[tool_use] ${name}`);
      items.push({
        id: `${messageId}-tool-${toolIndex}`,
        kind: 'tool_call',
        messageId,
        sequence: items.length,
        role: 'assistant',
        content: `[tool_use] ${name}`,
        name,
        toolCallId,
        arguments: input,
        callId: toolCallId,
        timestamp,
        metadata: baseMetadata,
      });
      return;
    }

    if (block.type === 'tool_result') {
      const toolIndex = toolCounter > 0 ? toolCounter - 1 : 0;
      const toolCallId =
        (typeof block.tool_use_id === 'string' && block.tool_use_id) ||
        (typeof block.id === 'string' && block.id) ||
        `${messageId}-tool-${toolIndex}`;
      const result = extractContent(block.content ?? block.result ?? block.output);
      summaryParts.push(result || '[tool_result]');
      items.push({
        id: `${messageId}-tool-result-${items.length}`,
        kind: 'tool_result',
        messageId: `${toolCallId}-result`,
        sequence: items.length,
        role: 'user',
        content: result,
        result,
        toolCallId,
        callId: toolCallId,
        isError: Boolean(block.is_error),
        timestamp,
        metadata: baseMetadata,
      });
      return;
    }

    if ('content' in block) {
      visit(block.content);
      return;
    }

    if ('message' in block) {
      visit(block.message);
    }
  };

  visit(content);
  return {
    summary: summaryParts.filter(Boolean).join('\n'),
    items,
  };
}

function isInterestingLine(line: ClaudeCodeLine): boolean {
  if (line.type === 'file-history-snapshot' || line.type === 'snapshot' || line.type === 'permission-mode') {
    return false;
  }

  if (line.type === 'attachment') {
    return false;
  }

  if (line.isMeta === true) {
    return false;
  }

  return true;
}

function isMessageCandidate(line: ClaudeCodeLine): boolean {
  if (!isInterestingLine(line)) {
    return false;
  }

  if (Array.isArray(line.messages)) {
    return false;
  }

  return (
    typeof line.type === 'string' ||
    typeof line.role === 'string' ||
    typeof line.message === 'object' ||
    typeof line.content !== 'undefined' ||
    typeof line.text !== 'undefined'
  );
}

function mapMessage(raw: ClaudeCodeLine, fallbackSessionId: string, index: number): ParsedClaudeMessage {
  const message = (raw.message && typeof raw.message === 'object' ? (raw.message as Record<string, unknown>) : raw) as Record<string, unknown>;
  const roleValue = typeof message.role === 'string' ? message.role : typeof raw.type === 'string' ? raw.type : 'assistant';
  const role = (roleValue === 'user' || roleValue === 'assistant' || roleValue === 'system' ? roleValue : 'assistant') as
    | 'user'
    | 'assistant'
    | 'system';
  const messageId = typeof raw.uuid === 'string' && raw.uuid ? raw.uuid : typeof message.id === 'string' && message.id ? message.id : `${fallbackSessionId}-message-${index}`;
  const parsed = parseClaudeContent(
    message.content ?? message.message ?? message.text ?? raw.content ?? raw.text,
    messageId,
    role,
    normalizeTimestamp(typeof raw.timestamp === 'string' ? raw.timestamp : typeof message.timestamp === 'string' ? message.timestamp : undefined),
    {
      ...raw,
      message,
    },
  );

  const toolCallsFromItems = parsed.items
    .filter((item): item is SessionItem & { kind: 'tool_call' } => item.kind === 'tool_call')
    .map((item) => ({
      id: item.toolCallId ?? item.id,
      name: item.name ?? 'tool',
      arguments: item.arguments ?? '{}',
      result: undefined as string | undefined,
      displayName: item.name ?? 'tool',
      description: '',
      renderOutputAsMarkdown: true,
    }));

  return {
    message: {
      id: messageId,
      role,
      content: parsed.summary || extractContent(message.content ?? message.message ?? message.text ?? raw.content ?? raw.text),
      timestamp: normalizeTimestamp(typeof raw.timestamp === 'string' ? raw.timestamp : typeof message.timestamp === 'string' ? message.timestamp : undefined),
      attachments: Array.isArray(raw.attachments) ? raw.attachments.map(String) : Array.isArray(message.attachments) ? message.attachments.map(String) : undefined,
      toolCalls: toolCallsFromItems.length > 0 ? toolCallsFromItems : undefined,
      metadata: {
        ...raw,
        message,
      },
    },
    items: parsed.items,
  };
}

export async function parseClaudeCodeSession(content: string, sourcePath?: string): Promise<ParseResult> {
  const allLines = parseJsonLines(content);
  if (allLines.length === 0) {
    throw new Error('Claude Code session is empty');
  }

  const header = allLines[0] ?? {};
  const sessionId =
    allLines.find((line) => typeof line.sessionId === 'string' && line.sessionId)
      ?.sessionId?.toString() ??
    allLines.find((line) => typeof line.promptId === 'string' && line.promptId)
      ?.promptId?.toString() ??
    (sourcePath ? path.basename(sourcePath).replace(/\.[^.]+$/, '') : undefined) ??
    `claude-${crypto.randomUUID()}`;

  const timestamps = allLines
    .map((line) => typeof line.timestamp === 'string' ? line.timestamp : undefined)
    .filter((value): value is string => Boolean(value));
  const createdAt =
    normalizeTimestamp(
      allLines.find((line) => typeof line.created === 'string' && line.created)?.created ??
        timestamps[0],
      new Date(),
    );
  const updatedAt =
    normalizeTimestamp(
      allLines.find((line) => typeof line.modified === 'string' && line.modified)?.modified ??
        timestamps[timestamps.length - 1] ??
        createdAt,
      new Date(createdAt),
    );

  const headerMessages = Array.isArray(header.messages) ? header.messages : [];
  const streamedMessages = allLines
    .slice(1)
    .filter(isMessageCandidate)
    .map((entry, index) => mapMessage(entry, sessionId, index))
    .filter((parsed) => Boolean(parsed.message.content.trim()) || parsed.message.role !== 'system');
  const legacyHeaderMessages = headerMessages
    .filter((entry): entry is ClaudeCodeLine => Boolean(entry) && typeof entry === 'object')
    .filter(isMessageCandidate)
    .map((entry, index) => mapMessage(entry, sessionId, index));
  const messagesById = new Map<string, Session['messages'][number]>();
  const itemsByMessageId = new Map<string, SessionItem[]>();
  for (const parsed of [...legacyHeaderMessages, ...streamedMessages]) {
    messagesById.set(parsed.message.id, parsed.message);
    itemsByMessageId.set(parsed.message.id, parsed.items);
  }
  const messages = Array.from(messagesById.values());
  const items = Array.from(itemsByMessageId.values()).flat();
  const titleFromContent = messages.find((message) => message.role === 'user' && message.content.trim())?.content.trim();

  const session: Session = ensureSession({
    id: sessionId,
    platform: 'claude-code',
    sourcePlatform: 'claude-code',
    sourceFormat: { type: 'claude-code', variant: 'ndjson' },
    createdAt,
    updatedAt,
    title:
      (typeof allLines.find((line) => typeof line.title === 'string' && line.title)?.title === 'string'
        ? (allLines.find((line) => typeof line.title === 'string' && line.title)?.title as string)
        : typeof allLines.find((line) => typeof line.firstPrompt === 'string' && line.firstPrompt)?.firstPrompt === 'string'
          ? (allLines.find((line) => typeof line.firstPrompt === 'string' && line.firstPrompt)?.firstPrompt as string)
          : undefined) ?? titleFromContent?.slice(0, 120),
    cwd:
      typeof allLines.find((line) => typeof line.cwd === 'string' && line.cwd)?.cwd === 'string'
        ? (allLines.find((line) => typeof line.cwd === 'string' && line.cwd)?.cwd as string)
        : undefined,
    messages,
    items,
    rawContent: content,
    rawRecords: allLines,
    nativeMetadata: {
      header,
      sourcePath: sourcePath ?? '',
    },
    isNativeUnchanged: true,
    metadata: {
      sessionId,
      sourcePath: sourcePath ?? '',
      messageCount: messages.length,
      rawLineCount: allLines.length,
    },
  });

  const format: SessionFormat = { type: 'claude-code', variant: 'ndjson' };
  return { session, raw: allLines, format };
}
