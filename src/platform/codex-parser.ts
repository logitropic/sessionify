import path from 'node:path';
import { ensureSession } from '../session/parser.js';
import { ParseResult, Session, SessionFormat, SessionItem, normalizeTimestamp } from '../session/types.js';

type CodexLine = Record<string, unknown> & {
  type?: unknown;
  timestamp?: unknown;
  payload?: unknown;
  item?: unknown;
  id?: unknown;
  cwd?: unknown;
  originator?: unknown;
  model_provider?: unknown;
  source?: unknown;
  sessionId?: unknown;
};

type ToolCallRecord = NonNullable<Session['messages'][number]['toolCalls']>[number];

function parseLines(content: string): CodexLine[] {
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as CodexLine];
      } catch {
        return [];
      }
    });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function getStringField(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return undefined;
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((part) => {
        if (typeof part === 'string') {
          return [part];
        }

        const item = asObject(part);
        if (!item) {
          return [];
        }

        if (typeof item.text === 'string') {
          return [item.text];
        }

        if (typeof item.OutputText === 'string') {
          return [item.OutputText];
        }

        if (typeof item.InputText === 'string') {
          return [item.InputText];
        }

        if (typeof item.output_text === 'string') {
          return [item.output_text];
        }

        if (typeof item.input_text === 'string') {
          return [item.input_text];
        }

        if (typeof item.output === 'string') {
          return [item.output];
        }

        if (typeof item.result === 'string') {
          return [item.result];
        }

        if (item.type === 'InputImage' || item.type === 'input_image' || item.type === 'image') {
          return ['[image]'];
        }

        if (item.type === 'FunctionCall') {
          const name = typeof item.name === 'string' && item.name ? item.name : 'tool';
          return [`[function_call] ${name}`];
        }

        if (item.type === 'FunctionCallOutput' || item.type === 'function_call_output') {
          return ['[function_call_output]'];
        }

        if (item.content !== undefined) {
          return [flattenContent(item.content)];
        }

        if (item.message !== undefined) {
          return [flattenContent(item.message)];
        }

        return [];
      })
      .filter(Boolean)
      .join('\n');
  }

  const object = asObject(content);
  if (!object) {
    return '';
  }

  if (typeof object.text === 'string') {
    return object.text;
  }

  if (typeof object.displayContent === 'string') {
    return object.displayContent;
  }

  if (typeof object.message === 'string') {
    return object.message;
  }

  if (typeof object.output === 'string') {
    return object.output;
  }

  if (typeof object.result === 'string') {
    return object.result;
  }

  if (object.content !== undefined) {
    return flattenContent(object.content);
  }

  return '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isDuplicateTextMessage(
  messages: Session['messages'],
  role: 'user' | 'assistant' | 'system',
  text: string,
): boolean {
  const previousMessage = messages[messages.length - 1];
  return Boolean(
    previousMessage &&
      previousMessage.role === role &&
      normalizeText(previousMessage.content) === normalizeText(text),
  );
}

function getMetaCandidate(line: CodexLine): Record<string, unknown> {
  if (line.type === 'session_meta' && line.payload) {
    const payload = asObject(line.payload);
    if (!payload) {
      return {};
    }

    const nestedMeta = asObject(payload.meta);
    return nestedMeta ?? payload;
  }

  if (line.type === 'session_meta') {
    return line;
  }

  return line;
}

function getSessionId(lines: CodexLine[], sourcePath?: string): string {
  for (const line of lines) {
    const meta = getMetaCandidate(line);
    const candidate =
      (typeof meta.id === 'string' && meta.id) ||
      (typeof meta.sessionId === 'string' && meta.sessionId) ||
      (typeof meta.session_id === 'string' && meta.session_id);

    if (candidate) {
      return candidate;
    }
  }

  if (sourcePath) {
    return path.basename(sourcePath).replace(/\.[^.]+$/, '');
  }

  return `codex-${crypto.randomUUID()}`;
}

function getMessageTimestamp(line: CodexLine, fallback?: string): string {
  if (typeof line.timestamp === 'string' && line.timestamp) {
    return normalizeTimestamp(line.timestamp);
  }

  const payload = asObject(line.payload);
  if (payload && typeof payload.timestamp === 'string' && payload.timestamp) {
    return normalizeTimestamp(payload.timestamp);
  }

  const item = asObject(line.item);
  if (item && typeof item.timestamp === 'string' && item.timestamp) {
    return normalizeTimestamp(item.timestamp);
  }

  return normalizeTimestamp(fallback, new Date());
}

function mapRole(value: unknown): 'user' | 'assistant' | 'system' {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : 'assistant';
}

function extractToolCallName(payload: Record<string, unknown>): string {
  return typeof payload.name === 'string' && payload.name ? payload.name : 'tool';
}

function stringifyToolPayloadValue(value: unknown, fallback = '{}'): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return fallback;
}

function extractExecCommand(payload: Record<string, unknown>): string {
  if (typeof payload.command === 'string') {
    return payload.command;
  }

  if (Array.isArray(payload.command)) {
    const commandParts = payload.command.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (commandParts.length === 0) {
      return '';
    }

    return commandParts[commandParts.length - 1] ?? '';
  }

  return '';
}

function extractToolCallArguments(payload: Record<string, unknown>): string {
  switch (payload.type) {
    case 'custom_tool_call':
      return stringifyToolPayloadValue(payload.input);
    case 'web_search_call':
      return stringifyToolPayloadValue(payload.action);
    case 'tool_search_call': {
      const combined: Record<string, unknown> = {};

      if (payload.arguments !== undefined) {
        combined.arguments =
          typeof payload.arguments === 'string'
            ? payload.arguments
            : payload.arguments;
      }

      if (payload.execution !== undefined) {
        combined.execution = payload.execution;
      }

      return Object.keys(combined).length > 0 ? JSON.stringify(combined) : '{}';
    }
    default:
      return stringifyToolPayloadValue(payload.arguments);
  }
}

function createToolCall(
  callId: string,
  payload: Record<string, unknown>,
  existing?: ToolCallRecord,
): ToolCallRecord {
  return {
    id: callId,
    namespace: typeof payload.namespace === 'string' && payload.namespace ? payload.namespace : existing?.namespace,
    name: existing?.name ?? extractToolCallName(payload),
    arguments: existing?.arguments ?? extractToolCallArguments(payload),
    result: existing?.result,
  };
}

export async function parseCodexSession(content: string, sourcePath?: string): Promise<ParseResult> {
  const lines = parseLines(content);
  if (lines.length === 0) {
    throw new Error('Codex session is empty');
  }

  const meta = getMetaCandidate(lines[0] ?? {});
  const sessionId = getSessionId(lines, sourcePath);
  const messages: Session['messages'] = [];
  const items: SessionItem[] = [];
  let lastAssistantIndex = -1;
  const seenToolCallIds = new Set<string>();
  const seenToolResultIds = new Set<string>();

  function pushTextMessage(
    role: 'user' | 'assistant' | 'system',
    text: string,
    timestamp: string,
    metadata: Record<string, unknown>,
    attachments?: string[],
  ) {
    const messageId = `${sessionId}-message-${messages.length}`;
    messages.push({
      id: messageId,
      role,
      content: text,
      timestamp,
      attachments,
      toolCalls: undefined,
      metadata,
    });
    items.push({
      id: `${messageId}-text`,
      kind: 'text',
      messageId,
      sequence: 0,
      role,
      content: text,
      timestamp,
      attachments,
      metadata,
    });
    return messageId;
  }

  function ensureAssistantAnchor(timestamp: string, metadata: Record<string, unknown>): number {
    if (lastAssistantIndex >= 0) {
      return lastAssistantIndex;
    }

    pushTextMessage('assistant', '', timestamp, metadata);
    lastAssistantIndex = messages.length - 1;
    return lastAssistantIndex;
  }

  function pushReasoningMessage(
    text: string,
    timestamp: string,
    metadata: Record<string, unknown>,
  ) {
    const messageId = `${sessionId}-message-${messages.length}`;
    messages.push({
      id: messageId,
      role: 'assistant',
      content: text,
      timestamp,
      toolCalls: undefined,
      metadata,
    });
    items.push({
      id: `${messageId}-reasoning`,
      kind: 'reasoning',
      messageId,
      sequence: 0,
      role: 'assistant',
      content: text,
      timestamp,
      metadata,
    });
    return messageId;
  }

  for (const [index, line] of lines.entries()) {
    const lineType = typeof line.type === 'string' ? line.type : '';
    if (lineType === 'session_meta') {
      continue;
    }

    const payload = asObject(line.payload) ?? {};
    const item = asObject(line.item) ?? {};
    const rawRole = typeof line.role === 'string' ? line.role : undefined;

    if (!lineType && rawRole && (line.content !== undefined || line.message !== undefined)) {
      const text = flattenContent(line.content ?? line.message);
      if (text.trim()) {
        pushTextMessage(
        mapRole(rawRole),
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
        Array.isArray(payload.images)
          ? payload.images.map(String)
          : Array.isArray(payload.local_images)
            ? payload.local_images.map(String)
            : undefined,
      );
        if (mapRole(rawRole) === 'assistant') {
          lastAssistantIndex = messages.length - 1;
        }
      }
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'user_message' &&
      typeof payload.message === 'string'
    ) {
      const text = flattenContent(payload.message || payload.text || '');
      if (!text.trim()) {
        continue;
      }

      if (isDuplicateTextMessage(messages, 'user', text)) {
        lastAssistantIndex = -1;
        continue;
      }

      pushTextMessage(
        'user',
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
        Array.isArray(payload.images)
          ? payload.images.map(String)
          : Array.isArray(payload.local_images)
            ? payload.local_images.map(String)
            : undefined,
      );
      lastAssistantIndex = -1;
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'agent_message' &&
      typeof payload.message === 'string'
    ) {
      const text = flattenContent(payload.message || payload.text || '');
      if (!text.trim()) {
        continue;
      }

      if (isDuplicateTextMessage(messages, 'assistant', text)) {
        lastAssistantIndex = messages.length - 1;
        continue;
      }

      pushTextMessage(
        'assistant',
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
        Array.isArray(payload.images)
          ? payload.images.map(String)
          : Array.isArray(payload.local_images)
            ? payload.local_images.map(String)
          : undefined,
      );
      lastAssistantIndex = messages.length - 1;
      continue;
    }

    if (
      lineType === 'event_msg' &&
      (payload.type === 'agent_reasoning' || payload.type === 'agent_thought') &&
      typeof payload.text === 'string'
    ) {
      const text = flattenContent(payload.text || '');
      if (!text.trim()) {
        continue;
      }

      pushReasoningMessage(
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
      );
      lastAssistantIndex = messages.length - 1;
      continue;
    }

    if (
      lineType === 'event_msg' &&
      (payload.type === 'system_message' || payload.type === 'system') &&
      typeof payload.message === 'string'
    ) {
      const text = flattenContent(payload.message || payload.text || '');
      if (!text.trim()) {
        continue;
      }

      if (isDuplicateTextMessage(messages, 'system', text)) {
        lastAssistantIndex = -1;
        continue;
      }

      pushTextMessage(
        'system',
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
      );
      lastAssistantIndex = -1;
      continue;
    }

    if (lineType === 'response_item' && payload.type === 'message') {
      const role = mapRole(payload.role);
      const text = flattenContent(payload.content ?? payload.message ?? payload.displayContent ?? '');
      const attachments = Array.isArray(payload.images)
        ? payload.images.map(String)
        : Array.isArray(payload.local_images)
          ? payload.local_images.map(String)
          : undefined;
      if (!text.trim()) {
        continue;
      }

      const previousMessage = messages[messages.length - 1];
      if (previousMessage && previousMessage.role === role && normalizeText(previousMessage.content) === normalizeText(text)) {
        lastAssistantIndex = role === 'assistant' ? messages.length - 1 : lastAssistantIndex;
        continue;
      }

      pushTextMessage(
        role,
        text,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
        attachments,
      );
      lastAssistantIndex = role === 'assistant' ? messages.length - 1 : -1;
      continue;
    }

    if (
      lineType === 'response_item' &&
      payload.type === 'reasoning' &&
      (typeof payload.text === 'string' || typeof payload.content === 'string')
    ) {
      const reasoning = flattenContent(payload.text ?? payload.content ?? '');
      if (!reasoning.trim()) {
        continue;
      }

      pushReasoningMessage(
        reasoning,
        getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        {
          ...line,
          payload,
          item,
        },
      );
      lastAssistantIndex = messages.length - 1;
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'reasoning',
        messageId: lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.id ?? `${sessionId}-message-${lastAssistantIndex}` : `${sessionId}-reasoning-${index}`,
        sequence: 0,
        role: 'assistant',
        content: reasoning,
        timestamp: getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined),
        metadata: {
          ...line,
          payload,
          item,
        },
      });
      continue;
    }

    if (
      lineType === 'response_item' &&
      (payload.type === 'function_call' ||
        payload.type === 'tool_search_call' ||
        payload.type === 'web_search_call' ||
        payload.type === 'image_generation_call' ||
        payload.type === 'custom_tool_call')
    ) {
      const callId =
        (typeof payload.call_id === 'string' && payload.call_id) ||
        (typeof payload.id === 'string' && payload.id) ||
        `${sessionId}-tool-${index}`;
      if (seenToolCallIds.has(callId)) {
        continue;
      }
      seenToolCallIds.add(callId);
      const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
      const assistantIndex = ensureAssistantAnchor(timestamp, {
        ...line,
        payload,
        item,
      });
      if (assistantIndex >= 0) {
        const current = messages[assistantIndex];
        if (!current) {
          continue;
        }
        const currentCalls = current?.toolCalls ?? [];
        const nextCall = createToolCall(callId, payload, currentCalls.find((call) => call.id === callId));
        current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), nextCall];
      }
      const responseType = payload.type === 'tool_search_call' ? 'tool_search_call' : 'function_call';
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'tool_call',
        messageId: messages[assistantIndex]?.id ?? `${sessionId}-message-${assistantIndex}`,
        sequence: ((messages[assistantIndex]?.toolCalls?.length ?? 0) * 2) + 1,
        role: 'assistant',
        name: extractToolCallName(payload),
        toolCallId: callId,
        arguments: extractToolCallArguments(payload),
        timestamp,
        metadata: {
          ...line,
          payload,
          item,
          responseType,
          ...(typeof payload.namespace === 'string' && payload.namespace ? { namespace: payload.namespace } : {}),
        },
      });
      continue;
    }

    if (
      lineType === 'response_item' &&
      (payload.type === 'function_call_output' ||
        payload.type === 'custom_tool_call_output' ||
        payload.type === 'mcp_tool_call_output' ||
        payload.type === 'tool_search_output')
    ) {
      const callId =
        (typeof payload.call_id === 'string' && payload.call_id) ||
        `${sessionId}-tool-${index}`;
      const resultValue = payload.output ?? payload.result ?? payload.execution ?? payload.tools;
      const result =
        typeof resultValue === 'string'
          ? resultValue
          : resultValue && typeof resultValue === 'object'
            ? JSON.stringify(resultValue)
            : '';

      if (seenToolResultIds.has(callId)) {
        continue;
      }
      seenToolResultIds.add(callId);
      const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
      const assistantIndex = ensureAssistantAnchor(timestamp, {
        ...line,
        payload,
        item,
      });

      if (assistantIndex >= 0) {
        const current = messages[assistantIndex];
        if (!current) {
          continue;
        }
        const currentCalls = current?.toolCalls ?? [];
        const existing = currentCalls.find((call) => call.id === callId);
        const nextCall = createToolCall(callId, payload, existing);
        nextCall.result = result;
        current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), nextCall];
      }
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'tool_result',
        messageId: `${callId}-result`,
        sequence: 0,
        role: 'user',
        toolCallId: callId,
        callId,
        result,
        content: result,
        timestamp,
        metadata: {
          ...line,
          payload,
          item,
        },
      });
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'exec_command_begin'
    ) {
      const callId = getStringField(payload, 'call_id', 'callId') ?? `${sessionId}-exec-${index}`;
      const turnId = getStringField(payload, 'turn_id', 'turnId') ?? '';
      const command = extractExecCommand(payload);
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;

      if (seenToolCallIds.has(callId)) {
        continue;
      }
      seenToolCallIds.add(callId);
      const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
      const assistantIndex = ensureAssistantAnchor(timestamp, {
        ...line,
        payload,
        item,
      });

      if (assistantIndex >= 0) {
        const current = messages[assistantIndex];
        if (current) {
          const currentCalls = current?.toolCalls ?? [];
          const existing = currentCalls.find((call) => call.id === callId);
          const nextCall = createToolCall(callId, { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: command, ...(cwd ? { workdir: cwd } : {}) }) }, existing);
          current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), nextCall];
        }
      }
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'tool_call',
        messageId: messages[assistantIndex]?.id ?? `${sessionId}-message-${assistantIndex}`,
        sequence: 0,
        role: 'assistant',
        name: 'exec_command',
        toolCallId: callId,
        arguments: JSON.stringify({ cmd: command, ...(cwd ? { workdir: cwd } : {}) }),
        timestamp,
        metadata: {
          ...line,
          payload,
          item,
          responseType: 'function_call',
          turnId,
        },
      });
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'exec_command_end'
    ) {
      const callId = getStringField(payload, 'call_id', 'callId') ?? `${sessionId}-exec-${index}`;

      if (seenToolResultIds.has(callId)) {
        continue;
      }
      seenToolResultIds.add(callId);
      const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
      const assistantIndex = ensureAssistantAnchor(timestamp, {
        ...line,
        payload,
        item,
      });

      const stdout = typeof payload.stdout === 'string' ? payload.stdout : '';
      const aggregatedOutput = typeof payload.aggregated_output === 'string' ? payload.aggregated_output : stdout;
      const exitCode = typeof payload.exit_code === 'number' ? payload.exit_code : 0;
      const status = typeof payload.status === 'string' ? payload.status : 'completed';
      const result = aggregatedOutput || (status === 'failed' ? `exit code ${exitCode}` : '');
      const command = extractExecCommand(payload);
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;

      if (assistantIndex >= 0) {
        const current = messages[assistantIndex];
        if (current) {
          const currentCalls = current?.toolCalls ?? [];
          const existing = currentCalls.find((call) => call.id === callId);
          const nextCall = createToolCall(
            callId,
            {
              type: 'function_call',
              name: 'exec_command',
              arguments: JSON.stringify({
                cmd: command,
                ...(cwd ? { workdir: cwd } : {}),
              }),
            },
            existing,
          );
          nextCall.result = result;
          current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), nextCall];
        }
      }
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'tool_result',
        messageId: `${callId}-result`,
        sequence: 0,
        role: 'user',
        toolCallId: callId,
        callId,
        result,
        content: result,
        isError: status === 'failed',
        timestamp,
        metadata: {
          ...line,
          payload,
          item,
        },
      });
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'dynamic_tool_call_request'
    ) {
      const callId = getStringField(payload, 'call_id', 'callId') ?? `${sessionId}-dyn-${index}`;
      const turnId = getStringField(payload, 'turn_id', 'turnId') ?? '';
      const toolName = typeof payload.tool === 'string' ? payload.tool : 'tool';
      const argsObj = asObject(payload.arguments);
      const args = argsObj ? JSON.stringify(argsObj) : '{}';

      if (!seenToolCallIds.has(callId)) {
        seenToolCallIds.add(callId);
        const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
        const assistantIndex = ensureAssistantAnchor(timestamp, {
          ...line,
          payload,
          item,
        });

        if (assistantIndex >= 0) {
          const current = messages[assistantIndex];
          if (current) {
            const currentCalls = current?.toolCalls ?? [];
            const existing = currentCalls.find((call) => call.id === callId);
            const nextCall = createToolCall(callId, { type: 'function_call', name: toolName, arguments: args }, existing);
            current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), nextCall];
          }
        }
        items.push({
          id: `${sessionId}-item-${index}`,
          kind: 'tool_call',
          messageId: messages[assistantIndex]?.id ?? `${sessionId}-message-${assistantIndex}`,
          sequence: 0,
          role: 'assistant',
          name: toolName,
          toolCallId: callId,
          arguments: args,
          timestamp,
          metadata: {
            ...line,
            payload,
            item,
            responseType: 'function_call',
            turnId,
          },
        });
      }
      continue;
    }

    if (
      lineType === 'event_msg' &&
      payload.type === 'dynamic_tool_call_response'
    ) {
      const callId = getStringField(payload, 'call_id', 'callId') ?? `${sessionId}-dyn-${index}`;

      if (seenToolResultIds.has(callId)) {
        continue;
      }
      seenToolResultIds.add(callId);
      const timestamp = getMessageTimestamp(line, typeof meta.timestamp === 'string' ? meta.timestamp : undefined);
      const assistantIndex = ensureAssistantAnchor(timestamp, {
        ...line,
        payload,
        item,
      });

      const contentItems = asArray(payload.content_items ?? payload.contentItems);
      const result = flattenContent(contentItems ?? payload);
      const success = payload.success !== false;
      const errorMsg = typeof payload.error === 'string' ? payload.error : undefined;

      if (assistantIndex >= 0) {
        const current = messages[assistantIndex];
        if (current) {
          const currentCalls = current?.toolCalls ?? [];
          const existing = currentCalls.find((call) => call.id === callId);
          if (existing) {
            existing.result = result;
            current.toolCalls = [...currentCalls.filter((call) => call.id !== callId), existing];
          }
        }
      }
      items.push({
        id: `${sessionId}-item-${index}`,
        kind: 'tool_result',
        messageId: `${callId}-result`,
        sequence: 0,
        role: 'user',
        toolCallId: callId,
        callId,
        result,
        content: result,
        isError: !success || !!errorMsg,
        timestamp,
        metadata: {
          ...line,
          payload,
          item,
          errorMessage: errorMsg,
        },
      });
      continue;
    }
  }

  const normalizedMessages = messages.length > 0 ? messages : [
    {
      id: `${sessionId}-message-0`,
      role: 'assistant' as const,
      content: '',
      timestamp: normalizeTimestamp(typeof meta.timestamp === 'string' ? meta.timestamp : undefined, new Date()),
      metadata: {},
    },
  ];
  const titleFromContent = normalizedMessages.find((message) => message.role === 'user' && message.content.trim())?.content.trim();

  const session: Session = ensureSession({
    id: sessionId,
    platform: 'codex',
    sourcePlatform: 'codex',
    sourceFormat: { type: 'codex', variant: 'jsonl' },
    createdAt: normalizeTimestamp(typeof meta.timestamp === 'string' ? meta.timestamp : undefined, new Date()),
    updatedAt: normalizeTimestamp(
      typeof lines.at(-1)?.timestamp === 'string'
        ? (lines.at(-1)?.timestamp as string)
        : typeof meta.timestamp === 'string'
          ? meta.timestamp
          : undefined,
      new Date(),
    ),
    cwd: typeof meta.cwd === 'string' ? meta.cwd : undefined,
    title: (typeof meta.title === 'string' ? meta.title : undefined) ?? titleFromContent?.slice(0, 120),
    messages: normalizedMessages,
    items,
    rawContent: content,
    rawRecords: lines,
    nativeMetadata: {
      header: lines[0] ?? {},
      sourcePath: sourcePath ?? '',
    },
    isNativeUnchanged: true,
    metadata: {
      ...meta,
      sourcePath: sourcePath ?? '',
      rawLineCount: lines.length,
      messageCount: normalizedMessages.length,
    },
  });

  const format: SessionFormat = { type: 'codex', variant: 'jsonl' };
  return { session, raw: lines, format };
}
