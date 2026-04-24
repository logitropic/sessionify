import { SerializeResult, Session, SessionItem } from '../session/types.js';
import { deriveSessionItems } from '../session/items.js';

type ClaudeContentBlock = Record<string, unknown>;
type ClaudeTranscriptLine = Record<string, unknown>;

type ToolMapping = {
  mappedName: string;
  input: unknown;
  resultKind: 'bash' | 'passthrough';
};

type RunningBashSession = {
  sessionId: string;
  command: string;
};

const STANDARD_CLAUDE_TOOLS = new Set([
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Grep',
  'Glob',
  'LS',
  'NotebookEdit',
  'Task',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
]);

function getToolName(item: SessionItem): string {
  return item.name ?? '';
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

function createClaudeMessageId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '');
}

function createClaudeLineId(): string {
  return globalThis.crypto.randomUUID();
}

function getAssistantModel(session: Session): string | undefined {
  return typeof session.metadata?.model === 'string' ? session.metadata.model : undefined;
}

function buildAssistantMessage(session: Session, content: ClaudeContentBlock[], stopReason?: string | null): Record<string, unknown> {
  const message: Record<string, unknown> = {
    id: createClaudeMessageId(),
    type: 'message',
    role: 'assistant',
    content,
  };

  const model = getAssistantModel(session);
  if (model) {
    message.model = model;
  }

  message.stop_reason = stopReason ?? session.metadata?.stop_reason ?? null;
  message.stop_sequence = session.metadata?.stop_sequence ?? null;

  if (session.metadata?.usage && typeof session.metadata.usage === 'object') {
    message.usage = session.metadata.usage;
  }

  return message;
}

function buildUserMessage(content: string | ClaudeContentBlock[]): Record<string, unknown> {
  return {
    role: 'user',
    content,
  };
}

function encodeLine(
  session: Session,
  params: {
    type: 'user' | 'assistant' | 'system';
    uuid: string;
    parentUuid: string | null;
    timestamp: string;
    message?: Record<string, unknown>;
    promptId?: string;
    sourceToolAssistantUUID?: string;
    toolUseResult?: unknown;
    attachments?: string[];
  },
): ClaudeTranscriptLine {
  const line: ClaudeTranscriptLine = {
    parentUuid: params.parentUuid,
    isSidechain: false,
  };

  if (params.message) {
    line.message = params.message;
  }

  line.type = params.type;
  line.uuid = params.uuid;
  line.timestamp = params.timestamp;

  if (params.promptId) {
    line.promptId = params.promptId;
  }

  if (params.sourceToolAssistantUUID) {
    line.sourceToolAssistantUUID = params.sourceToolAssistantUUID;
  }

  if (params.toolUseResult !== undefined) {
    line.toolUseResult = params.toolUseResult;
  }

  if (params.attachments && params.attachments.length > 0) {
    line.attachments = params.attachments;
  }

  line.userType = session.metadata?.userType ?? 'external';
  line.entrypoint = session.metadata?.entrypoint ?? 'cli';
  line.cwd = session.cwd ?? '';
  line.sessionId = session.id;
  line.version = session.metadata?.version ?? 'unknown';

  if (typeof session.metadata?.gitBranch === 'string' && session.metadata.gitBranch) {
    line.gitBranch = session.metadata.gitBranch;
  }

  if (typeof session.metadata?.slug === 'string' && session.metadata.slug) {
    line.slug = session.metadata.slug;
  }

  return line;
}

function normalizeToolResultText(item: SessionItem): string {
  const parseStringResult = (value: string): string => {
    if (!value) {
      return value;
    }

    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'string' ? parsed : value;
    } catch {
      return value;
    }
  };

  if (typeof item.result === 'string' && item.result.length > 0) {
    return parseStringResult(item.result);
  }

  if (typeof item.content === 'string' && item.content.length > 0) {
    return parseStringResult(item.content);
  }

  return '';
}

function extractBashCommand(item: SessionItem): string | null {
  const parsedArguments = parseArguments(item.arguments);
  const args = parsedArguments && typeof parsedArguments === 'object' ? (parsedArguments as Record<string, unknown>) : {};

  if (item.name === 'exec_command') {
    if (typeof args.cmd === 'string' && args.cmd) {
      return args.cmd;
    }

    if (typeof args.command === 'string' && args.command) {
      return args.command;
    }

    if (typeof item.arguments === 'string' && item.arguments) {
      return item.arguments;
    }
  }

  return null;
}

function extractToolInput(item: SessionItem): Record<string, unknown> {
  const parsedArguments = parseArguments(item.arguments);
  return parsedArguments && typeof parsedArguments === 'object' && !Array.isArray(parsedArguments)
    ? (parsedArguments as Record<string, unknown>)
    : {};
}

function buildGenericToolInput(item: SessionItem): unknown {
  const parsedArguments = parseArguments(item.arguments);
  if (parsedArguments && typeof parsedArguments === 'object' && !Array.isArray(parsedArguments)) {
    return parsedArguments;
  }

  if (typeof parsedArguments === 'string' && parsedArguments) {
    return { input: parsedArguments };
  }

  return {};
}

function extractSearchQuery(args: Record<string, unknown>, item: SessionItem): string {
  if (typeof args.query === 'string' && args.query) {
    return args.query;
  }

  const nestedArguments = args.arguments;
  if (nestedArguments && typeof nestedArguments === 'object' && !Array.isArray(nestedArguments)) {
    const nested = nestedArguments as Record<string, unknown>;
    if (typeof nested.query === 'string' && nested.query) {
      return nested.query;
    }
  }

  if (typeof nestedArguments === 'string' && nestedArguments) {
    return nestedArguments;
  }

  return item.arguments ?? '';
}

function collectRunningBashSessions(items: SessionItem[]): Map<string, RunningBashSession> {
  const toolCallById = new Map<string, SessionItem>();
  const sessions = new Map<string, RunningBashSession>();

  for (const item of items) {
    if (item.kind === 'tool_call') {
      toolCallById.set(item.toolCallId ?? item.id, item);
      continue;
    }

    if (item.kind !== 'tool_result') {
      continue;
    }

    const matchingCall = toolCallById.get(item.toolCallId ?? item.id);
    if (!matchingCall || matchingCall.name !== 'exec_command') {
      continue;
    }

    const command = extractBashCommand(matchingCall);
    const resultText = normalizeToolResultText(item);
    const matches = [...resultText.matchAll(/session ID[: ]+(\d+)/gi)];
    for (const match of matches) {
      const sessionId = match[1];
      if (!sessionId || !command) {
        continue;
      }

      sessions.set(sessionId, { sessionId, command });
    }
  }

  return sessions;
}

function mapTool(item: SessionItem, runningBashSessions: Map<string, RunningBashSession>): ToolMapping {
  const args = extractToolInput(item);
  const toolName = getToolName(item);

  switch (toolName) {
    case 'exec_command': {
      const command = extractBashCommand(item) ?? 'true';

      const input: Record<string, unknown> = {
        command,
      };

      if (typeof args.justification === 'string' && args.justification) {
        input.description = args.justification;
      }

      if (typeof args.workdir === 'string' && args.workdir) {
        input.cwd = args.workdir;
      }

      return {
        mappedName: 'Bash',
        input,
        resultKind: 'bash',
      };
    }
    case 'Bash': {
      const command =
        (typeof args.command === 'string' && args.command) ||
        (typeof args.cmd === 'string' && args.cmd) ||
        (typeof args.input === 'string' && args.input) ||
        extractBashCommand(item) ||
        'true';

      const input: Record<string, unknown> = {
        command,
      };

      if (typeof args.description === 'string' && args.description) {
        input.description = args.description;
      } else if (typeof args.justification === 'string' && args.justification) {
        input.description = args.justification;
      }

      if (typeof args.cwd === 'string' && args.cwd) {
        input.cwd = args.cwd;
      } else if (typeof args.workdir === 'string' && args.workdir) {
        input.cwd = args.workdir;
      }

      if (typeof args.timeout_ms === 'number') {
        input.timeout_ms = args.timeout_ms;
      }

      return {
        mappedName: 'Bash',
        input,
        resultKind: 'bash',
      };
    }
    case 'Read':
    case 'Write':
    case 'Grep':
    case 'NotebookEdit':
      return {
        mappedName: toolName,
        input: args,
        resultKind: 'passthrough',
      };
    case 'tool_search':
    case 'search':
    case 'web_search': {
      return {
        mappedName: 'WebSearch',
        input: {
          query: extractSearchQuery(args, item),
        },
        resultKind: 'passthrough',
      };
    }
    case 'write_stdin': {
      const sessionId = typeof args.session_id === 'number' || typeof args.session_id === 'string' ? String(args.session_id) : 'unknown';
      const chars = typeof args.chars === 'string' ? args.chars : '';
      const runningSession = runningBashSessions.get(sessionId);

      return {
        mappedName: 'Bash',
        input: {
          command: runningSession?.command ?? `write_stdin ${sessionId}`,
          description: chars ? `Sent stdin to session ${sessionId}` : `Polled session ${sessionId}`,
        },
        resultKind: 'bash',
      };
    }
    case 'request_user_input':
      return {
        mappedName: 'AskUserQuestion',
        input: args,
        resultKind: 'passthrough',
      };
    case 'list_mcp_resources':
      return {
        mappedName: 'ListMcpResourcesTool',
        input: args,
        resultKind: 'passthrough',
      };
    case 'read_mcp_resource':
      return {
        mappedName: 'ReadMcpResourceTool',
        input: args,
        resultKind: 'passthrough',
      };
    default:
      if (STANDARD_CLAUDE_TOOLS.has(toolName)) {
        return {
          mappedName: toolName,
          input: args,
          resultKind: 'passthrough',
        };
      }
      return {
        mappedName: toolName || 'tool',
        input: buildGenericToolInput(item),
        resultKind: 'passthrough',
      };
  }
}

function buildToolUseResult(item: SessionItem, mapping: ToolMapping): unknown {
  if (item.metadata?.toolUseResult && typeof item.metadata.toolUseResult === 'object') {
    return item.metadata.toolUseResult;
  }

  const resultText = normalizeToolResultText(item);
  if (mapping.resultKind === 'bash') {
    return {
      stdout: resultText,
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
    };
  }

  return resultText;
}

export async function serializeClaudeCodeSession(session: Session): Promise<SerializeResult> {
  const items = deriveSessionItems(session);
  const runningBashSessions = collectRunningBashSessions(items);
  const lines: ClaudeTranscriptLine[] = [];
  let parentUuid: string | null = null;
  let latestAssistantUuid: string | null = null;
  const promptId =
    typeof session.metadata?.promptId === 'string' && session.metadata.promptId
      ? session.metadata.promptId
      : session.id;

  for (const item of items) {
    const timestamp = item.timestamp ?? session.createdAt;
    if (item.kind === 'text') {
      const content = item.content ?? '';
      if (!content) {
        continue;
      }

      const lineUuid = createClaudeLineId();
      const line = encodeLine(session, {
        type: item.role === 'user' ? 'user' : item.role === 'system' ? 'system' : 'assistant',
        uuid: lineUuid,
        parentUuid,
        timestamp,
        message:
          item.role === 'assistant'
            ? buildAssistantMessage(session, [{ type: 'text', text: content }], null)
            : buildUserMessage(content),
        ...(item.role === 'user' ? { promptId } : {}),
        ...(item.attachments && item.attachments.length > 0 ? { attachments: item.attachments } : {}),
      });
      lines.push(line);
      parentUuid = lineUuid;
      if (item.role !== 'user') {
        latestAssistantUuid = lineUuid;
      }
      continue;
    }

    if (item.kind === 'reasoning') {
      const content = item.content ?? '';
      if (!content) {
        continue;
      }

      const lineUuid = createClaudeLineId();
      const line = encodeLine(session, {
        type: 'assistant',
        uuid: lineUuid,
        parentUuid,
        timestamp,
        message: buildAssistantMessage(session, [{ type: 'thinking', thinking: content }], null),
      });
      lines.push(line);
      parentUuid = lineUuid;
      latestAssistantUuid = lineUuid;
      continue;
    }

    if (item.kind === 'tool_call') {
      const mapping = mapTool(item, runningBashSessions);
      const lineUuid = createClaudeLineId();
      const line = encodeLine(session, {
        type: 'assistant',
        uuid: lineUuid,
        parentUuid,
        timestamp,
        message: buildAssistantMessage(
          session,
          [
            {
              type: 'tool_use',
              id: item.toolCallId ?? item.id,
              name: mapping.mappedName,
              input: mapping.input,
            },
          ],
          'tool_use',
        ),
      });
      lines.push(line);
      parentUuid = lineUuid;
      latestAssistantUuid = lineUuid;
      continue;
    }

    if (item.kind === 'tool_result') {
      const matchingCall = items.find((candidate) => candidate.kind === 'tool_call' && (candidate.toolCallId ?? candidate.id) === (item.toolCallId ?? item.id));
      const mapping = matchingCall ? mapTool(matchingCall, runningBashSessions) : null;

      if (!mapping) {
        const lineUuid = createClaudeLineId();
        const line = encodeLine(session, {
          type: 'user',
          uuid: lineUuid,
          parentUuid,
          timestamp,
          promptId,
          message: buildUserMessage(normalizeToolResultText(item) || '[unsupported tool result]'),
        });
        lines.push(line);
        parentUuid = lineUuid;
        continue;
      }

      const lineUuid = createClaudeLineId();
      const line = encodeLine(session, {
        type: 'user',
        uuid: lineUuid,
        parentUuid,
        timestamp,
        promptId,
        toolUseResult: buildToolUseResult(item, mapping),
        message: buildUserMessage([
          {
            type: 'tool_result',
            tool_use_id: item.callId ?? item.toolCallId ?? item.id,
            content: normalizeToolResultText(item),
            is_error: item.isError ?? Boolean(item.metadata?.isError),
          },
        ]),
        ...(latestAssistantUuid ? { sourceToolAssistantUUID: latestAssistantUuid } : {}),
      });
      lines.push(line);
      parentUuid = lineUuid;
    }
  }

  const header = {
    sessionId: session.id,
    created: session.createdAt,
    modified: session.updatedAt,
    cwd: session.cwd ?? '',
    title: session.title ?? '',
    messages: lines,
    ...session.metadata,
  };

  const serializedLines = [
    JSON.stringify(header),
    ...lines.map((line) => JSON.stringify(line)),
  ];

  return {
    content: `${serializedLines.join('\n')}\n`,
    platform: 'claude-code',
    format: { type: 'claude-code', variant: 'ndjson' },
    extension: 'jsonl',
  };
}
