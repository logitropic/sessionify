import type { Session, SessionItem, SessionMessage } from './types.js';
import { acpTranscriptToSessionItems } from '../acp/transcript.js';

function normalizeText(value: string | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function summarizeToolCall(message: SessionMessage, toolCallIndex: number): string {
  const toolCall = message.toolCalls?.[toolCallIndex];
  if (!toolCall) {
    return '[tool_call]';
  }

  return `[tool_call] ${toolCall.name}`;
}

function inferToolResultError(toolCall: NonNullable<SessionMessage['toolCalls']>[number]): boolean | undefined {
  if (toolCall.status === 'error' || toolCall.status === 'failed') {
    return true;
  }

  if (toolCall.status === 'success' || toolCall.status === 'completed') {
    return false;
  }

  return undefined;
}

function extractReasoningTexts(message: SessionMessage): string[] {
  const thoughts = message.metadata?.thoughts;
  if (!Array.isArray(thoughts)) {
    return [];
  }

  return thoughts
    .flatMap((thought) => {
      if (typeof thought === 'string') {
        return [thought];
      }

      if (thought && typeof thought === 'object') {
        const record = thought as Record<string, unknown>;
        if (typeof record.text === 'string') {
          return [record.text];
        }
        if (typeof record.thinking === 'string') {
          return [record.thinking];
        }
      }

      return [];
    })
    .map(normalizeText)
    .filter(Boolean);
}

export function deriveSessionItems(session: Pick<Session, 'id' | 'messages' | 'items' | 'acp'>): SessionItem[] {
  if (session.items?.length) {
    return session.items;
  }

  if (session.acp?.updates?.length) {
    return acpTranscriptToSessionItems(session.acp);
  }

  return session.messages.flatMap((message, messageIndex) => {
    const messageId = message.id || `${session.id}-message-${messageIndex}`;
    const items: SessionItem[] = [];
    const hasText = normalizeText(message.content).length > 0;
    const baseItem: SessionItem = {
      id: messageId,
      kind: 'text',
      messageId,
      sequence: 0,
      role: message.role,
      content: message.content,
      attachments: message.attachments,
      metadata: message.metadata,
      timestamp: message.timestamp,
    };
    const reasoningTexts = message.role === 'assistant' ? extractReasoningTexts(message) : [];

    if (hasText || (reasoningTexts.length === 0 && !message.toolCalls?.length)) {
      items.push(baseItem);
    }

    reasoningTexts.forEach((reasoning, reasoningIndex) => {
      items.push({
        id: `${messageId}-reasoning-${reasoningIndex}`,
        kind: 'reasoning',
        messageId,
        sequence: reasoningIndex,
        role: 'assistant',
        content: reasoning,
        metadata: message.metadata,
        timestamp: message.timestamp,
      });
    });

    message.toolCalls?.forEach((toolCall, toolIndex) => {
      const toolItemId = `${messageId}-tool-${toolIndex}`;
      items.push({
        id: toolItemId,
        kind: 'tool_call',
        messageId,
        sequence: toolIndex * 2 + 1,
        role: message.role,
        name: toolCall.name,
        toolCallId: toolCall.id,
        arguments: toolCall.arguments,
        metadata: {
          ...message.metadata,
          ...(toolCall.namespace ? { namespace: toolCall.namespace } : {}),
        },
        timestamp: message.timestamp,
      });

      if (toolCall.result !== undefined) {
        items.push({
          id: `${toolItemId}-result`,
          kind: 'tool_result',
          messageId,
          sequence: toolIndex * 2 + 2,
          role: 'user',
          name: toolCall.name,
          toolCallId: toolCall.id,
          callId: toolCall.id,
          result: toolCall.result,
          content: toolCall.result,
          isError: inferToolResultError(toolCall),
          metadata: {
            ...message.metadata,
            ...(toolCall.namespace ? { namespace: toolCall.namespace } : {}),
          },
          timestamp: message.timestamp,
        });
      }
    });

    if (items.length === 0) {
      items.push({
        ...baseItem,
        content: summarizeToolCall(message, 0),
      });
    }

    return items;
  });
}

export function groupSessionItems(items: SessionItem[]): SessionItem[][] {
  const groups = new Map<string, SessionItem[]>();
  for (const item of items) {
    const group = groups.get(item.messageId) ?? [];
    group.push(item);
    groups.set(item.messageId, group);
  }

  return Array.from(groups.values());
}

export function summarizeSessionItem(item: SessionItem): string {
  if (item.kind === 'text') {
    return normalizeText(item.content);
  }

  if (item.kind === 'reasoning') {
    return normalizeText(item.content) || '[thinking]';
  }

  if (item.kind === 'tool_call') {
    return `[tool_call] ${item.name ?? 'tool'}`;
  }

  if (item.kind === 'tool_result') {
    return normalizeText(item.result ?? item.content) || '[tool_result]';
  }

  return normalizeText(item.content);
}

export function buildMessageContentFromItems(items: SessionItem[]): string {
  const textParts = items
    .filter((item) => item.kind === 'text' || item.kind === 'reasoning')
    .map((item) => summarizeSessionItem(item))
    .filter(Boolean);

  if (textParts.length > 0) {
    return textParts.join('\n');
  }

  const toolParts = items.map((item) => summarizeSessionItem(item)).filter(Boolean);
  return toolParts.join('\n');
}
