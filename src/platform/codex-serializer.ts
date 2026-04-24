import { SerializeResult, Session, SessionItem } from '../session/types.js';
import { deriveSessionItems, groupSessionItems } from '../session/items.js';

function getToolCallId(item: SessionItem): string {
  return item.toolCallId ?? item.callId ?? item.id;
}

function normalizeToolName(name: string | undefined): string {
  if (!name) {
    return 'tool';
  }

  if (name === 'Bash' || name === 'shell' || name === 'container.exec' || name === 'shell_command') {
    return 'exec_command';
  }

  return name;
}

function isExecCommandTool(name: string | undefined): boolean {
  return normalizeToolName(name) === 'exec_command';
}

function normalizeToolSummaryText(text: string | undefined): string {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function isToolSummaryOnlyText(text: string | undefined): boolean {
  const normalized = normalizeToolSummaryText(text);
  if (!normalized) {
    return true;
  }

  const lines = normalized.split('\n');
  return lines.every((line) => line === 'tools' || line.startsWith('[tool_call]') || line.startsWith('[tool_result]'));
}

function serializeMessageItem(item: SessionItem): Record<string, unknown> | null {
  if (item.kind !== 'text') {
    return null;
  }

  const text = item.content ?? '';
  const role = item.role ?? 'assistant';
  const contentType = role === 'user' ? 'input_text' : 'output_text';
  const payload: Record<string, unknown> = {
    type: 'message',
    role,
    content: text
      ? [
          {
            type: contentType,
            text,
          },
        ]
      : [],
  };

  if (role === 'user') {
    payload.images = item.attachments ?? [];
    payload.local_images = [];
    payload.text_elements = [];
  }

  if (role === 'assistant') {
    payload.phase = item.metadata?.phase ?? 'commentary';
    payload.memory_citation = item.metadata?.memory_citation ?? null;
  }

  return {
    type: 'response_item',
    timestamp: item.timestamp,
    payload,
  };
}

function serializeEventMessage(item: SessionItem): Record<string, unknown> | null {
  if (item.kind !== 'text') {
    return null;
  }

  const text = item.content ?? '';
  const role = item.role ?? 'assistant';

  if (!text) {
    return null;
  }

  if (role === 'user') {
    return {
      type: 'event_msg',
      timestamp: item.timestamp,
      payload: {
        type: 'user_message',
        message: text,
        images: item.attachments ?? [],
        local_images: [],
        text_elements: [],
      },
    };
  }

  return {
    type: 'event_msg',
    timestamp: item.timestamp,
    payload: {
      type: 'agent_message',
      message: text,
      phase: item.metadata?.phase ?? 'commentary',
      memory_citation: item.metadata?.memory_citation ?? null,
    },
  };
}

function parseArguments(value: string | undefined): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractToolInput(item: SessionItem): Record<string, unknown> {
  const parsedArguments = parseArguments(item.arguments);
  return parsedArguments && typeof parsedArguments === 'object' && !Array.isArray(parsedArguments)
    ? (parsedArguments as Record<string, unknown>)
    : {};
}

function extractRawToolInput(item: SessionItem): unknown {
  if (typeof item.arguments !== 'string' || !item.arguments) {
    return {};
  }

  const parsed = parseArguments(item.arguments);
  return parsed ?? {};
}

function extractShellCommand(item: SessionItem): string {
  const args = extractToolInput(item);
  if (typeof args.command === 'string' && args.command) {
    return args.command;
  }

  if (typeof args.cmd === 'string' && args.cmd) {
    return args.cmd;
  }

  if (typeof item.arguments === 'string' && item.arguments) {
    return item.arguments;
  }

  return 'true';
}

function extractWorkdir(item: SessionItem): string | undefined {
  const args = extractToolInput(item);
  if (typeof args.workdir === 'string' && args.workdir) {
    return args.workdir;
  }

  if (typeof args.cwd === 'string' && args.cwd) {
    return args.cwd;
  }

  return undefined;
}

function stringifyInput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return '{}';
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return '';
}

function parseToolSearchTools(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseArguments(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).tools)) {
      return (parsed as Record<string, unknown>).tools as unknown[];
    }
    return value ? [{ text: value }] : [];
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.tools)) {
      return record.tools as unknown[];
    }
    return [record];
  }

  return [];
}

function serializeToolOutput(item: SessionItem): Record<string, unknown> | null {
  if (item.kind !== 'tool_result') {
    return null;
  }

  const callId = getToolCallId(item);
  const toolName = normalizeToolName(item.name ?? '');
  const output = item.result ?? item.content ?? '';

  let payload: Record<string, unknown>;
  if (toolName === 'apply_patch') {
    payload = {
      type: 'custom_tool_call_output',
      call_id: callId,
      output,
    };
  } else if (toolName === 'tool_search' || toolName === 'search') {
    payload = {
      type: 'tool_search_output',
      call_id: callId,
      status: item.isError ? 'failed' : 'completed',
      execution: 'local',
      tools: parseToolSearchTools(output),
    };
  } else if (typeof item.metadata?.namespace === 'string' && item.metadata.namespace.trim()) {
    payload = {
      type: 'mcp_tool_call_output',
      call_id: callId,
      output,
    };
  } else {
    payload = {
      type: 'function_call_output',
      call_id: callId,
      output,
    };
  }

  return {
    type: 'response_item',
    timestamp: item.timestamp,
    payload,
  };
}

function serializeResponseItem(item: SessionItem): Record<string, unknown> | null {
  if (item.kind === 'tool_call') {
    const callId = getToolCallId(item);
    const toolName = normalizeToolName(item.name ?? 'tool');
    const args = extractToolInput(item);
    let payload: Record<string, unknown>;

    if (isExecCommandTool(toolName)) {
      const shellArguments = extractToolInput(item);
      const normalizedShellArguments = {
        ...shellArguments,
      } as Record<string, unknown>;
      delete normalizedShellArguments.command;
      delete normalizedShellArguments.cmd;
      normalizedShellArguments.cmd = extractShellCommand(item);
      const workdir = extractWorkdir(item);
      if (workdir) {
        normalizedShellArguments.workdir = workdir;
      }

      payload = {
        type: 'function_call',
        name: 'exec_command',
        call_id: callId,
        arguments: JSON.stringify(normalizedShellArguments),
      };
    } else if (toolName === 'apply_patch') {
      payload = {
        type: 'custom_tool_call',
        name: 'apply_patch',
        call_id: callId,
        input: typeof item.arguments === 'string' && item.arguments ? item.arguments : stringifyInput(args),
      };
    } else if (toolName === 'tool_search' || toolName === 'search') {
      payload = {
        type: 'tool_search_call',
        call_id: callId,
        status: 'completed',
        execution: 'local',
        arguments: extractRawToolInput(item),
      };
    } else if (toolName === 'web_search') {
      const query =
        (typeof args.query === 'string' && args.query) ||
        (typeof args.arguments === 'object' && args.arguments && !Array.isArray(args.arguments) && typeof (args.arguments as Record<string, unknown>).query === 'string'
          ? String((args.arguments as Record<string, unknown>).query)
          : undefined) ||
        (typeof item.arguments === 'string' ? item.arguments : '');
      payload = {
        type: 'web_search_call',
        action: {
          type: 'search',
          query,
        },
      };
    } else {
      payload = {
        type: 'function_call',
        name: toolName,
        call_id: callId,
        arguments:
          typeof item.arguments === 'string' && item.arguments
            ? item.arguments
            : stringifyInput(args),
      };
    }

    return {
      type: 'response_item',
      timestamp: item.timestamp,
      payload: {
        ...payload,
        ...(item.metadata?.namespace && typeof item.metadata.namespace === 'string'
          ? { namespace: item.metadata.namespace }
          : {}),
      },
    };
  }

  return null;
}

function buildExecParsedCommand(cmd: string): Array<Record<string, unknown>> {
  return [{ type: 'unknown', cmd }];
}

function buildExecCommand(cmd: string): string[] {
  return ['/bin/zsh', '-lc', cmd];
}

function serializeToolEvent(
  item: SessionItem,
  toolCallById: Map<string, SessionItem>,
): Record<string, unknown> | null {
  if (item.kind !== 'tool_call' && item.kind !== 'tool_result') {
    return null;
  }

  const callId = getToolCallId(item);
  const callItem = item.kind === 'tool_call' ? item : toolCallById.get(callId);
  const toolName = normalizeToolName(callItem?.name ?? item.name ?? 'tool');
  const turnId = callId;
  const args = callItem ? extractToolInput(callItem) : {};

  if (item.kind === 'tool_call') {
    if (isExecCommandTool(toolName)) {
      const cmd = callItem ? extractShellCommand(callItem) : '';
      const cwd = callItem ? extractWorkdir(callItem) : undefined;

      return {
        type: 'event_msg',
        timestamp: item.timestamp,
        payload: {
          type: 'exec_command_begin',
          call_id: callId,
          turn_id: turnId,
          command: buildExecCommand(cmd),
          cwd: cwd ?? '',
          parsed_cmd: buildExecParsedCommand(cmd),
          source: 'unified_exec_startup',
        },
      };
    }

    if (toolName === 'apply_patch') {
      return null;
    }

    return {
      type: 'event_msg',
      timestamp: item.timestamp,
      payload: {
        type: 'dynamic_tool_call_request',
        call_id: callId,
        turn_id: turnId,
        tool: toolName,
        arguments: args,
      },
    };
  }

  const output = stringifyToolResult(item.result ?? item.content ?? '');

  if (isExecCommandTool(toolName)) {
    const cmd = callItem ? extractShellCommand(callItem) : '';
    const cwd = callItem ? extractWorkdir(callItem) : undefined;
    const failed = item.isError === true;

    return {
      type: 'event_msg',
      timestamp: item.timestamp,
      payload: {
        type: 'exec_command_end',
        call_id: callId,
        process_id: '0',
        turn_id: turnId,
        command: buildExecCommand(cmd),
        cwd: cwd ?? '',
        parsed_cmd: buildExecParsedCommand(cmd),
        source: 'unified_exec_startup',
        stdout: failed ? '' : output,
        stderr: failed ? output : '',
        aggregated_output: output,
        exit_code: failed ? 1 : 0,
        duration: {
          secs: 0,
          nanos: 0,
        },
        formatted_output: '',
        status: failed ? 'failed' : 'completed',
      },
    };
  }

  if (toolName === 'apply_patch') {
    return null;
  }

  return {
    type: 'event_msg',
    timestamp: item.timestamp,
    payload: {
      type: 'dynamic_tool_call_response',
      call_id: callId,
      turn_id: turnId,
      tool: toolName,
      success: item.isError !== true,
      content_items: output
        ? [
            {
              type: 'output_text',
              text: output,
            },
          ]
        : [],
      ...(item.isError ? { error: output || 'Tool failed' } : {}),
    },
  };
}

function buildSessionMeta(session: Session): Record<string, unknown> {
  const metadata = session.metadata ?? {};
  const modelProvider =
    typeof process.env.CODEX_MODEL_PROVIDER_ID === 'string' && process.env.CODEX_MODEL_PROVIDER_ID.trim()
      ? process.env.CODEX_MODEL_PROVIDER_ID.trim()
      : typeof process.env.CODEX_MODEL_PROVIDER === 'string' && process.env.CODEX_MODEL_PROVIDER.trim()
        ? process.env.CODEX_MODEL_PROVIDER.trim()
        : 'openai';
  const passthroughMetadata = { ...metadata } as Record<string, unknown>;
  delete passthroughMetadata.id;
  delete passthroughMetadata.timestamp;
  delete passthroughMetadata.cwd;
  delete passthroughMetadata.cli_version;
  delete passthroughMetadata.cliVersion;
  delete passthroughMetadata.originator;
  delete passthroughMetadata.source;
  delete passthroughMetadata.model_provider;
  const payload = {
    id: session.id,
    timestamp: session.createdAt,
    cwd: session.cwd ?? '',
    originator: 'Codex Desktop',
    cli_version: metadata.cli_version ?? metadata.cliVersion ?? 'unknown',
    source: 'vscode',
    model_provider: modelProvider,
    ...passthroughMetadata,
  };

  return {
    timestamp: session.createdAt,
    type: 'session_meta',
    payload,
  };
}

export async function serializeCodexSession(session: Session): Promise<SerializeResult> {
  const items = deriveSessionItems(session);
  const groupedItems = groupSessionItems(items);
  const toolCallById = new Map<string, SessionItem>();
  items.forEach((item) => {
    if (item.kind === 'tool_call') {
      toolCallById.set(getToolCallId(item), item);
    }
  });
  const lines = [JSON.stringify(buildSessionMeta(session))];

  for (const group of groupedItems) {
    const textItem = group.find((item) => item.kind === 'text');
    const reasoningItem = group.find((item) => item.kind === 'reasoning');
    const toolItems = group.some((item) => item.kind === 'tool_call' || item.kind === 'tool_result');
    const shouldSkipText = !!(toolItems && textItem && isToolSummaryOnlyText(textItem.content));

    if (textItem && !shouldSkipText) {
      const serialized = serializeMessageItem(textItem);
      if (serialized) {
        lines.push(JSON.stringify(serialized));
      }
      const eventMsg = serializeEventMessage(textItem);
      if (eventMsg) {
        lines.push(JSON.stringify(eventMsg));
      }
    }

    if (reasoningItem) {
      lines.push(
        JSON.stringify({
          type: 'response_item',
          timestamp: reasoningItem.timestamp,
          payload: {
            type: 'reasoning',
            text: reasoningItem.content ?? '',
          },
        }),
      );
    }

    for (const item of group) {
      const serializedResponse = serializeResponseItem(item) ?? serializeToolOutput(item);
      const serializedEvent = serializeToolEvent(item, toolCallById);

      if (item.kind === 'tool_result') {
        if (serializedEvent) {
          lines.push(JSON.stringify(serializedEvent));
        }
        if (serializedResponse) {
          lines.push(JSON.stringify(serializedResponse));
        }
        continue;
      }

      if (serializedResponse) {
        lines.push(JSON.stringify(serializedResponse));
      }
      if (serializedEvent) {
        lines.push(JSON.stringify(serializedEvent));
      }
    }
  }

  return {
    content: `${lines.join('\n')}\n`,
    platform: 'codex',
    format: { type: 'codex', variant: 'jsonl' },
    extension: 'jsonl',
  };
}
