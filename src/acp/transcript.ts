import type { Session, SessionItem } from '../session/types.js';
import {
  type AcpTranscript,
  type ContentBlock,
  type SessionInfo,
  type SessionUpdate,
  type ToolCall,
  type ToolCallStatus,
} from './schema.js';

export type { AcpTranscript } from './schema.js';

function normalizeText(value: string | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function contentBlockToText(block: ContentBlock): string {
  if (block.type === 'text') {
    return block.text;
  }

  if (block.type === 'resource_link') {
    return block.title ?? block.name ?? '';
  }

  return '';
}

export function getAcpTranscriptTitle(transcript: AcpTranscript | undefined): string {
  if (!transcript) {
    return '';
  }

  const sessionInfoUpdate = [...transcript.updates].reverse().find(
    (entry) => entry.sessionUpdate === 'session_info_update',
  );

  if (sessionInfoUpdate) {
    return normalizeText(sessionInfoUpdate.title ?? transcript.sessionInfo.title ?? '');
  }

  const update = [...transcript.updates].reverse().find((entry) =>
    entry.sessionUpdate === 'user_message_chunk' ||
    entry.sessionUpdate === 'agent_message_chunk',
  );

  if (!update) {
    return normalizeText(transcript.sessionInfo.title ?? '');
  }

  const content = update.content.content;
  const parts = Array.isArray(content) ? content : [content];
  const text = parts.map(contentBlockToText).filter(Boolean).join(' ');
  return normalizeText(text) || normalizeText(transcript.sessionInfo.title ?? '');
}

export function getAcpMessageCount(transcript: AcpTranscript | undefined): number {
  if (!transcript) {
    return 0;
  }

  return transcript.updates.filter(
    (entry) => entry.sessionUpdate === 'user_message_chunk' || entry.sessionUpdate === 'agent_message_chunk',
  ).length;
}

function tryParseJson(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toTextBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

function inferToolKind(name: string | undefined): ToolCall['kind'] {
  const lower = (name ?? '').toLowerCase();
  if (lower.includes('search') || lower.includes('fetch') || lower.includes('query')) {
    return 'search';
  }
  if (lower.includes('edit') || lower.includes('patch')) {
    return 'edit';
  }
  if (lower.includes('read') || lower.includes('open') || lower.includes('cat')) {
    return 'read';
  }
  if (lower.includes('write') || lower.includes('save')) {
    return 'edit';
  }
  if (lower.includes('exec') || lower.includes('shell') || lower.includes('command') || lower.includes('run')) {
    return 'execute';
  }
  if (lower.includes('think') || lower.includes('reason')) {
    return 'think';
  }
  return 'other';
}

function buildToolCallUpdate(
  toolCallId: string,
  title: string,
  kind: ToolCall['kind'],
  rawInput: unknown,
  rawOutput: unknown,
  status: ToolCallStatus,
): SessionUpdate {
  const base: ToolCall = {
    toolCallId,
    title,
    kind,
    rawInput,
    rawOutput,
    status,
  };

  return {
    sessionUpdate: 'tool_call',
    ...base,
  };
}

function itemToSessionUpdates(item: SessionItem): SessionUpdate[] {
  const text = normalizeText(item.content ?? item.result);

  if (item.kind === 'text') {
    return [
      {
        sessionUpdate: item.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
        content: {
          content: toTextBlock(item.content ?? ''),
        },
      },
    ];
  }

  if (item.kind === 'reasoning') {
    return [
      {
        sessionUpdate: 'agent_thought_chunk',
        content: {
          content: toTextBlock(item.content ?? ''),
        },
      },
    ];
  }

  if (item.kind === 'tool_call') {
    const toolCallId = item.toolCallId ?? item.id;
    return [
      buildToolCallUpdate(
        toolCallId,
        item.name ?? 'tool',
        inferToolKind(item.name),
        tryParseJson(item.arguments),
        undefined,
        item.result ? 'completed' : 'in_progress',
      ),
    ];
  }

  if (item.kind === 'tool_result') {
    const toolCallId = item.toolCallId ?? item.id;
    return [
      {
        sessionUpdate: 'tool_call_update',
        toolCallId,
        title: item.name ?? null,
        kind: inferToolKind(item.name),
        rawOutput: tryParseJson(item.result ?? item.content),
        status: 'completed',
      },
    ];
  }

  return text
    ? [
        {
          sessionUpdate: 'agent_message_chunk',
          content: {
            content: toTextBlock(text),
          },
        },
      ]
    : [];
}

export function buildAcpTranscriptFromSession(
  session: Pick<Session, 'id' | 'messages' | 'items' | 'title' | 'cwd' | 'createdAt' | 'updatedAt' | 'metadata'>,
): AcpTranscript {
  const sourceItems = session.items?.length
    ? session.items
    : session.messages.flatMap((message, messageIndex): SessionItem[] => {
        const baseId = message.id || `${session.id}-message-${messageIndex}`;
        const items: SessionItem[] = [
          {
            id: `${baseId}-text`,
            kind: 'text',
            messageId: baseId,
            sequence: 0,
            role: message.role,
            content: message.content,
            attachments: message.attachments,
            metadata: message.metadata,
            timestamp: message.timestamp,
          },
        ];
        message.toolCalls?.forEach((toolCall, toolIndex) => {
          const toolItemId = `${baseId}-tool-${toolIndex}`;
          items.push({
            id: toolItemId,
            kind: 'tool_call',
            messageId: baseId,
            sequence: toolIndex * 2 + 1,
            role: message.role,
            name: toolCall.name,
            toolCallId: toolCall.id,
            arguments: toolCall.arguments,
            metadata: message.metadata,
            timestamp: message.timestamp,
          });
          if (toolCall.result !== undefined) {
          items.push({
            id: `${toolItemId}-result`,
            kind: 'tool_result',
            messageId: `${toolItemId}-result`,
            sequence: toolIndex * 2 + 2,
            role: 'user',
            name: toolCall.name,
            toolCallId: toolCall.id,
            callId: toolCall.id,
            result: toolCall.result,
            content: toolCall.result,
            isError: toolCall.status === 'error' || toolCall.status === 'failed' ? true : toolCall.status === 'success' || toolCall.status === 'completed' ? false : undefined,
            metadata: message.metadata,
            timestamp: message.timestamp,
          });
        }
        });
        return items;
      });

  const updates = sourceItems.flatMap(itemToSessionUpdates);

  const sessionInfo: SessionInfo = {
    sessionId: session.id,
    cwd: session.cwd ?? process.cwd(),
    title: session.title ?? null,
    updatedAt: session.updatedAt,
    _meta: session.metadata,
  };

  return {
    sessionInfo,
    updates,
    metadata: session.metadata,
  };
}

function updateToSessionItem(update: SessionUpdate, sessionId: string, index: number): SessionItem | undefined {
  if (update.sessionUpdate === 'user_message_chunk' || update.sessionUpdate === 'agent_message_chunk') {
    return {
      id: `${sessionId}-item-${index}`,
      kind: 'text',
      messageId: `${sessionId}-message-${index}`,
      sequence: index,
      role: update.sessionUpdate === 'user_message_chunk' ? 'user' : 'assistant',
      content: update.content.content.type === 'text' ? update.content.content.text : '',
      timestamp: new Date().toISOString(),
    };
  }

  if (update.sessionUpdate === 'agent_thought_chunk') {
    return {
      id: `${sessionId}-item-${index}`,
      kind: 'reasoning',
      messageId: `${sessionId}-message-${index}`,
      sequence: index,
      role: 'assistant',
      content: update.content.content.type === 'text' ? update.content.content.text : '',
      timestamp: new Date().toISOString(),
    };
  }

  if (update.sessionUpdate === 'tool_call') {
    return {
      id: `${sessionId}-item-${index}`,
      kind: 'tool_call',
      messageId: `${sessionId}-message-${index}`,
      sequence: index,
      role: 'assistant',
      name: update.title,
      toolCallId: update.toolCallId,
      arguments: JSON.stringify(update.rawInput ?? {}),
      timestamp: new Date().toISOString(),
      metadata: {
        status: update.status,
        kind: update.kind,
      },
    };
  }

  if (update.sessionUpdate === 'tool_call_update') {
    return {
      id: `${sessionId}-item-${index}`,
      kind: 'tool_result',
      messageId: `${sessionId}-message-${index}`,
      sequence: index,
      role: 'user',
      name: update.title ?? undefined,
      toolCallId: update.toolCallId,
      result: JSON.stringify(update.rawOutput ?? ''),
      content: typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput ?? ''),
      timestamp: new Date().toISOString(),
      metadata: {
        status: update.status,
        kind: update.kind,
      },
    };
  }

  return undefined;
}

export function acpTranscriptToSessionItems(transcript: AcpTranscript): SessionItem[] {
  const sessionId = transcript.sessionInfo.sessionId;
  return transcript.updates.flatMap((update, index) => {
    const item = updateToSessionItem(update, sessionId, index);
    return item ? [item] : [];
  });
}

export function cloneAcpTranscript(transcript: AcpTranscript, sessionId: string): AcpTranscript {
  return {
    ...transcript,
    sessionInfo: {
      ...transcript.sessionInfo,
      sessionId,
    },
    updates: transcript.updates.map((update) => ({ ...update })),
    metadata: transcript.metadata ? { ...transcript.metadata } : undefined,
  };
}
