import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { parseSessionContent, parseSessionFile } from '../../src/session/parser.js';
import { detectSessionFormat } from '../../src/session/detector.js';
import { discoverSessionFiles } from '../../src/utils/file-system.js';
import { writeTextFile } from '../../src/utils/file-system.js';

const claudeFixture = [
  JSON.stringify({
    sessionId: 'claude-1',
    created: '2026-04-20T10:00:00.000Z',
    modified: '2026-04-20T11:00:00.000Z',
    cwd: '/tmp/project',
    title: 'Claude session',
    messages: [
      {
        uuid: 'm1',
        role: 'user',
        content: 'hello',
        timestamp: '2026-04-20T10:01:00.000Z',
      },
    ],
  }),
  JSON.stringify({
    uuid: 'm2',
    role: 'assistant',
    content: 'world',
    timestamp: '2026-04-20T10:02:00.000Z',
  }),
].join('\n');

const claudeHistoryFixture = [
  JSON.stringify({
    type: 'file-history-snapshot',
    messageId: 'snapshot-1',
    snapshot: {
      messageId: 'snapshot-1',
      trackedFileBackups: {},
      timestamp: '2026-04-07T10:25:59.834Z',
    },
    isSnapshotUpdate: false,
  }),
  JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    promptId: 'prompt-1',
    type: 'user',
    message: {
      role: 'user',
      content: 'hello from claude code',
    },
    uuid: 'msg-1',
    timestamp: '2026-04-07T10:25:59.834Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/tmp/project',
    sessionId: 'claude-session-1',
    version: '2.1.92',
    gitBranch: 'main',
  }),
].join('\n');

const claudeAssistantFixture = [
  JSON.stringify({
    type: 'permission-mode',
    permissionMode: 'default',
    sessionId: 'claude-real-1',
  }),
  JSON.stringify({
    type: 'file-history-snapshot',
    messageId: 'snapshot-1',
    snapshot: {
      messageId: 'snapshot-1',
      trackedFileBackups: {},
      timestamp: '2026-04-12T06:18:52.935Z',
    },
    isSnapshotUpdate: false,
  }),
  JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    promptId: 'prompt-1',
    type: 'user',
    message: {
      role: 'user',
      content: 'design new chat app using figma',
    },
    uuid: 'user-1',
    timestamp: '2026-04-12T06:18:52.935Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/Users/hieunguyen/Coding/logitropic/claude-code',
    sessionId: 'claude-real-1',
    version: '2.1.104',
    gitBranch: 'main',
  }),
  JSON.stringify({
    parentUuid: '31125592-b8e1-4162-958d-22cb2f29a95b',
    isSidechain: false,
    message: {
      id: '062a6c4fb6bd0360292ba4e4038b0fdc',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'The user is asking me to design a new chat app using Figma.',
        },
        {
          type: 'text',
          text: 'I do not have direct access to Figma.',
        },
      ],
      model: 'MiniMax-M2.7',
      stop_reason: 'tool_use',
    },
    type: 'assistant',
    uuid: '4419c406-1040-493c-958d-c8e6d2b3ce33',
    timestamp: '2026-04-12T06:19:04.264Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/Users/hieunguyen/Coding/logitropic/claude-code',
    sessionId: 'claude-real-1',
    version: '2.1.104',
    gitBranch: 'main',
  }),
  JSON.stringify({
    parentUuid: '062a6c4fb6bd0360292ba4e4038b0fdc',
    isSidechain: false,
    message: {
      id: 'tool-result-1',
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_123',
          content: 'Tool output',
          is_error: false,
        },
      ],
    },
    type: 'user',
    uuid: 'tool-result-1',
    timestamp: '2026-04-12T06:19:05.000Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/Users/hieunguyen/Coding/logitropic/claude-code',
    sessionId: 'claude-real-1',
    version: '2.1.104',
    gitBranch: 'main',
  }),
].join('\n');

const claudeErrorFixture = [
  JSON.stringify({
    sessionId: 'claude-error-1',
    created: '2026-04-20T10:00:00.000Z',
    modified: '2026-04-20T10:05:00.000Z',
    cwd: '/tmp/project',
    title: 'Claude error session',
    messages: [],
  }),
  JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: 'assistant',
    uuid: 'assistant-error-1',
    timestamp: '2026-04-20T10:01:00.000Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/tmp/project',
    sessionId: 'claude-error-1',
    version: '2.1.104',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_error_1',
          name: 'Bash',
          input: {
            command: 'false',
          },
        },
      ],
    },
  }),
  JSON.stringify({
    parentUuid: 'assistant-error-1',
    isSidechain: false,
    type: 'user',
    uuid: 'tool-error-1',
    timestamp: '2026-04-20T10:01:01.000Z',
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/tmp/project',
    sessionId: 'claude-error-1',
    version: '2.1.104',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_error_1',
          content: 'Command failed',
          is_error: true,
        },
      ],
    },
  }),
].join('\n');

const codexFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: '019dae92-f019-7331-807d-af921356f768',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      cli_version: '0.122.0',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:01.073Z',
    type: 'event_msg',
    payload: {
      type: 'user_message',
      message: 'tìm và sửa lỗi',
      images: [],
      local_images: [],
      text_elements: [],
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'Tôi sẽ rà soát codebase để tìm lỗi rõ nhất.',
      phase: 'commentary',
      memory_citation: null,
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"git status --short"}',
      call_id: 'call-1',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:04.232Z',
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: 'call-1',
      output: ' M src/platform/codex-parser.ts',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:07.852Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'Tôi đã thấy đây là một dự án TypeScript.',
      phase: 'commentary',
      memory_citation: null,
    },
  }),
].join('\n');

const codexSimpleFixture = [
  JSON.stringify({
    id: 'codex-1',
    timestamp: '2026-04-20T10:00:00.000Z',
    cwd: '/tmp/project',
    originator: 'claude-code',
    model_provider: 'anthropic',
    source: 'cli',
  }),
  JSON.stringify({
    id: 'c1',
    role: 'user',
    content: [{ text: 'hello codex' }],
    timestamp: '2026-04-20T10:01:00.000Z',
  }),
].join('\n');

const codexDuplicateFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'dup-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:01.073Z',
    type: 'event_msg',
    payload: {
      type: 'user_message',
      message: 'hello',
      images: [],
      local_images: [],
      text_elements: [],
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'one assistant reply',
      phase: 'commentary',
      memory_citation: null,
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ text: 'one assistant reply' }],
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.932Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"echo test"}',
      call_id: 'call-1',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:04.232Z',
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'test',
    },
  }),
].join('\n');

const codexResponseItemMessageFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'message-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:01.073Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'hello codex' }],
      images: [],
      local_images: [],
      text_elements: [],
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'working on it' }],
      phase: 'commentary',
      memory_citation: null,
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"echo hello"}',
      call_id: 'call-1',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:04.232Z',
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'hello',
    },
  }),
].join('\n');

const codexVisibleToolLifecycleFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'visible-tool-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'running shell' }],
      phase: 'commentary',
      memory_citation: null,
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"echo hello"}',
      call_id: 'call-1',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:04.232Z',
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'hello',
    },
  }),
].join('\n');

const codexReasoningFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'reasoning-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'response_item',
    payload: {
      type: 'reasoning',
      content: 'thinking about the next step',
    },
  }),
].join('\n');

const codexCustomToolFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'custom-tool-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'Applying patch.',
      phase: 'commentary',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      name: 'apply_patch',
      call_id: 'patch-1',
      input: '*** Begin Patch\n*** Add File: sample.txt\n+hello\n*** End Patch\n',
    },
  }),
].join('\n');

const codexWebSearchFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'web-search-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.930Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'Searching docs.',
      phase: 'commentary',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'response_item',
    payload: {
      type: 'web_search_call',
      name: 'web_search',
      call_id: 'search-1',
      action: {
        type: 'search',
        query: 'claude code tool result transcript',
      },
    },
  }),
].join('\n');

const codexNamespacedFixture = [
  JSON.stringify({
    timestamp: '2026-04-21T05:45:58.596Z',
    type: 'session_meta',
    payload: {
      id: 'codex-namespaced-session',
      timestamp: '2026-04-21T05:45:58.596Z',
      cwd: '/Users/hieunguyen/Coding/logitropic/acp-sync',
      originator: 'codex-tui',
      source: 'cli',
      model_provider: 'openai',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.931Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'Reading Gmail.',
      phase: 'commentary',
    },
  }),
  JSON.stringify({
    timestamp: '2026-04-21T05:46:03.932Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'gmail.read',
      namespace: 'mcp__codex_apps__gmail',
      arguments: '{"message_id":"123"}',
      call_id: 'call-ns-1',
    },
  }),
].join('\n');

const geminiFixture = JSON.stringify({
  sessionId: 'gemini-1',
  projectHash: 'abc',
  startTime: '2026-04-20T10:00:00.000Z',
  lastUpdated: '2026-04-20T10:05:00.000Z',
  summary: 'Gemini session',
  messages: [
    {
      id: 'g1',
      type: 'user',
      timestamp: '2026-04-20T10:01:00.000Z',
      content: [{ text: 'hi gemini' }],
    },
    {
      id: 'g2',
      type: 'gemini',
      timestamp: '2026-04-20T10:02:00.000Z',
      content: [{ text: 'hello' }],
    },
  ],
});

const geminiToolFixture = JSON.stringify({
  sessionId: 'gemini-tool-1',
  projectHash: 'abc',
  startTime: '2026-04-20T10:00:00.000Z',
  lastUpdated: '2026-04-20T10:06:00.000Z',
  summary: 'Gemini tool session',
  messages: [
    {
      id: 'u1',
      type: 'user',
      timestamp: '2026-04-20T10:01:00.000Z',
      content: [{ text: 'running tool' }],
    },
    {
      id: 'g1',
      type: 'gemini',
      timestamp: '2026-04-20T10:02:00.000Z',
      content: [
        { text: 'working on it' },
        { functionCall: { id: 'toolu-1', name: 'search', args: { query: 'workspace' } } },
        {
          functionResponse: {
            id: 'toolu-1',
            name: 'search',
            response: {
              output: 'result text',
            },
          },
        },
      ],
    },
  ],
});

const geminiDisplayContentFixture = JSON.stringify({
  sessionId: 'gemini-display-1',
  projectHash: 'abc',
  startTime: '2026-04-20T10:00:00.000Z',
  lastUpdated: '2026-04-20T10:06:00.000Z',
  summary: 'Gemini display content session',
  messages: [
    {
      id: 'u1',
      type: 'user',
      timestamp: '2026-04-20T10:01:00.000Z',
      content: [{ text: 'run search' }],
    },
    {
      id: 'g1',
      type: 'gemini',
      timestamp: '2026-04-20T10:02:00.000Z',
      content: 'working on it',
      displayContent: [
        { text: 'working on it' },
        { functionCall: { id: 'toolu-2', name: 'search', args: { query: 'display-query' } } },
        {
          functionResponse: {
            id: 'toolu-2',
            name: 'search',
            response: {
              output: 'display result',
            },
          },
        },
      ],
    },
  ],
});

const geminiPreferredToolCallsFixture = JSON.stringify({
  sessionId: 'gemini-preferred-1',
  projectHash: 'abc',
  startTime: '2026-04-20T10:00:00.000Z',
  lastUpdated: '2026-04-20T10:06:00.000Z',
  summary: 'Gemini preferred tool call session',
  messages: [
    {
      id: 'u1',
      type: 'user',
      timestamp: '2026-04-20T10:01:00.000Z',
      content: [{ text: 'run search' }],
    },
    {
      id: 'g1',
      type: 'gemini',
      timestamp: '2026-04-20T10:02:00.000Z',
      content: [
        { text: 'working on it' },
        { functionCall: { id: 'toolu-1', name: 'search', args: { query: 'parts-query' } } },
      ],
      toolCalls: [
        {
          id: 'toolu-1',
          name: 'search',
          args: { query: 'toolcalls-query' },
          status: 'success',
          displayName: 'Search',
          description: 'Search workspace',
          renderOutputAsMarkdown: true,
          resultDisplay: 'result text',
          result: [
            {
              functionResponse: {
                id: 'toolu-1',
                name: 'search',
                response: {
                  output: 'result text',
                },
              },
            },
          ],
        },
      ],
    },
  ],
});

const geminiSubagentFixture = JSON.stringify({
  sessionId: 'gemini-subagent-1',
  projectHash: 'abc',
  startTime: '2026-04-20T10:00:00.000Z',
  lastUpdated: '2026-04-20T10:05:00.000Z',
  kind: 'subagent',
  messages: [
    {
      id: 'gs1',
      type: 'user',
      timestamp: '2026-04-20T10:01:00.000Z',
      content: [{ text: 'ignore me' }],
    },
  ],
});

describe('session parsing', () => {
  it('detects Claude Code content', async () => {
    const detection = await detectSessionFormat('claude.jsonl', claudeFixture);
    expect(detection?.platform).toBe('claude-code');

    const parsed = await parseSessionContent(claudeFixture, 'claude.jsonl');
    expect(parsed.session.platform).toBe('claude-code');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages[1]?.content).toBe('world');
  });

  it('detects Gemini sessions without optional metadata fields', async () => {
    const detection = await detectSessionFormat(
      'session.json',
      JSON.stringify({
        sessionId: 'gemini-1',
        startTime: '2026-04-20T10:00:00.000Z',
        lastUpdated: '2026-04-20T10:05:00.000Z',
        messages: [],
      }),
    );

    expect(detection?.platform).toBe('gemini');
  });

  it('preserves Claude tool_result error metadata', async () => {
    const parsed = await parseSessionContent(claudeErrorFixture, 'claude-error.jsonl');
    const toolResult = parsed.session.items?.find((item) => item.kind === 'tool_result');

    expect(parsed.session.platform).toBe('claude-code');
    expect(toolResult?.callId).toBe('toolu_error_1');
    expect(toolResult?.toolCallId).toBe('toolu_error_1');
    expect(toolResult?.isError).toBe(true);
  });

  it('parses Codex JSONL content', async () => {
    const parsed = await parseSessionContent(codexFixture, 'codex.jsonl');
    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.id).toBe('019dae92-f019-7331-807d-af921356f768');
    expect(parsed.session.messages[0]?.content).toBe('tìm và sửa lỗi');
    expect(parsed.session.messages.some((message) => message.content.includes('Tôi đã thấy đây'))).toBe(true);
    expect(parsed.session.messages.some((message) => message.toolCalls?.length)).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(parsed.session.acp?.updates.some((update) => update.sessionUpdate === 'tool_call')).toBe(true);
    expect(parsed.session.acp?.updates.some((update) => update.sessionUpdate === 'tool_call_update')).toBe(true);
  });

  it('parses Gemini JSON content', async () => {
    const parsed = await parseSessionContent(geminiFixture, 'gemini.json');
    expect(parsed.session.platform).toBe('gemini');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages[1]?.role).toBe('assistant');
  });

  it('loads session files from disk', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
    const filePath = path.join(dir, 'sample.jsonl');
    await writeTextFile(filePath, claudeFixture);

    const parsed = await parseSessionFile(filePath);
    expect(parsed.session.id).toBe('claude-1');

    const discovered = await discoverSessionFiles([dir]);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.platform).toBe('claude-code');
  });

  it('skips subagent sessions during discovery', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
    const claudeMainPath = path.join(dir, 'main-claude.jsonl');
    const claudeSubagentPath = path.join(dir, 'project', 'subagents', 'agent-1.jsonl');
    const geminiMainPath = path.join(dir, 'main-gemini.json');
    const geminiSubagentPath = path.join(dir, 'gemini-subagent.json');

    await writeTextFile(claudeMainPath, claudeFixture);
    await writeTextFile(claudeSubagentPath, claudeFixture);
    await writeTextFile(geminiMainPath, geminiFixture);
    await writeTextFile(geminiSubagentPath, geminiSubagentFixture);

    const discovered = await discoverSessionFiles([dir]);
    expect(discovered).toHaveLength(2);
    expect(discovered.some((session) => session.path.includes('/subagents/'))).toBe(false);
    expect(discovered.some((session) => session.path.endsWith('gemini-subagent.json'))).toBe(false);
    expect(discovered.map((session) => session.platform).sort()).toEqual(['claude-code', 'gemini']);
  });

  it('detects Claude Code file-history sessions', async () => {
    const detection = await detectSessionFormat('history.jsonl', claudeHistoryFixture);
    expect(detection?.platform).toBe('claude-code');

    const parsed = await parseSessionContent(claudeHistoryFixture, 'history.jsonl');
    expect(parsed.session.platform).toBe('claude-code');
    expect(parsed.session.messages.length).toBeGreaterThan(0);
    expect(parsed.session.messages.some((message) => message.content.includes('hello from claude code'))).toBe(true);
  });

  it('parses real Claude Code assistant wrapper content', async () => {
    const parsed = await parseSessionContent(claudeAssistantFixture, 'real-claude.jsonl');
    expect(parsed.session.platform).toBe('claude-code');
    expect(parsed.session.messages.some((message) => message.content.includes('direct access to Figma'))).toBe(true);
    expect(parsed.session.id).toBe('claude-real-1');
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(parsed.session.acp?.updates.length).toBeGreaterThan(0);
  });

  it('parses Codex content with the legacy header shape', async () => {
    const parsed = await parseSessionContent(codexSimpleFixture, 'codex.jsonl');
    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages[0]?.content).toBe('hello codex');
  });

  it('does not duplicate Codex assistant text from response_item.message', async () => {
    const parsed = await parseSessionContent(codexDuplicateFixture, 'codex-dup.jsonl');
    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(parsed.session.messages[1]?.content).toBe('one assistant reply');
    expect(parsed.session.messages.some((message) => message.content === 'one assistant reply')).toBe(true);
    expect(parsed.session.messages.filter((message) => message.content === 'one assistant reply')).toHaveLength(1);
    expect(parsed.session.messages.some((message) => message.toolCalls?.length)).toBe(true);
  });

  it('parses Codex response_item message content and attached tool calls', async () => {
    const parsed = await parseSessionContent(codexResponseItemMessageFixture, 'codex-message.jsonl');

    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages[0]?.role).toBe('user');
    expect(parsed.session.messages[0]?.content).toBe('hello codex');
    expect(parsed.session.messages[1]?.role).toBe('assistant');
    expect(parsed.session.messages[1]?.content).toBe('working on it');
    expect(parsed.session.messages[1]?.toolCalls?.[0]?.name).toBe('exec_command');
    expect(parsed.session.messages[1]?.toolCalls?.[0]?.arguments).toContain('"cmd":"echo hello"');
    expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
  });

  it('parses Codex visible tool lifecycle events without duplicating tool calls', async () => {
    const parsed = await parseSessionContent(codexVisibleToolLifecycleFixture, 'codex-visible-tools.jsonl');

    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages).toHaveLength(1);
    expect(parsed.session.messages[0]?.toolCalls?.length).toBe(1);
    expect(parsed.session.messages[0]?.toolCalls?.[0]?.name).toBe('exec_command');
    expect(parsed.session.messages[0]?.toolCalls?.[0]?.result).toBe('hello');
    expect(parsed.session.items?.filter((item) => item.kind === 'tool_call')).toHaveLength(1);
    expect(parsed.session.items?.filter((item) => item.kind === 'tool_result')).toHaveLength(1);
    expect(parsed.session.items?.find((item) => item.kind === 'tool_call')?.toolCallId).toBe('call-1');
    expect(parsed.session.items?.find((item) => item.kind === 'tool_result')?.callId).toBe('call-1');
  });

  it('parses Codex response_item reasoning as a reasoning message', async () => {
    const parsed = await parseSessionContent(codexReasoningFixture, 'codex-reasoning.jsonl');

    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages).toHaveLength(1);
    expect(parsed.session.messages[0]?.role).toBe('assistant');
    expect(parsed.session.messages[0]?.content).toBe('thinking about the next step');
    expect(parsed.session.items?.some((item) => item.kind === 'reasoning')).toBe(true);
  });

  it('preserves Codex custom tool input payloads', async () => {
    const parsed = await parseSessionContent(codexCustomToolFixture, 'codex-custom-tool.jsonl');
    const toolCall = parsed.session.items?.find((item) => item.kind === 'tool_call');

    expect(parsed.session.platform).toBe('codex');
    expect(toolCall?.name).toBe('apply_patch');
    expect(toolCall?.arguments).toContain('*** Begin Patch');
    expect(parsed.session.messages[0]?.toolCalls?.[0]?.arguments).toContain('*** Add File: sample.txt');
  });

  it('preserves Codex web search action payloads', async () => {
    const parsed = await parseSessionContent(codexWebSearchFixture, 'codex-web-search.jsonl');
    const toolCall = parsed.session.items?.find((item) => item.kind === 'tool_call');

    expect(parsed.session.platform).toBe('codex');
    expect(toolCall?.name).toBe('web_search');
    expect(toolCall?.arguments).toContain('"query":"claude code tool result transcript"');
    expect(parsed.session.messages[0]?.toolCalls?.[0]?.arguments).toContain('"type":"search"');
  });

  it('preserves Codex tool namespaces on tool calls', async () => {
    const parsed = await parseSessionContent(codexNamespacedFixture, 'codex-namespaced.jsonl');
    const assistantWithToolCall = parsed.session.messages.find((message) => message.toolCalls?.length > 0);

    expect(parsed.session.platform).toBe('codex');
    expect(assistantWithToolCall?.toolCalls?.[0]?.namespace).toBe('mcp__codex_apps__gmail');
    expect(parsed.session.items?.find((item) => item.kind === 'tool_call')?.metadata?.namespace).toBe('mcp__codex_apps__gmail');
  });

  it('parses Gemini function call and response parts as canonical items', async () => {
    const parsed = await parseSessionContent(geminiToolFixture, 'gemini-tool.json');
    expect(parsed.session.platform).toBe('gemini');
    expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(parsed.session.messages.some((message) => message.content.includes('running tool'))).toBe(true);
    expect(parsed.session.messages.some((message) => message.toolCalls?.some((tool) => tool.result))).toBe(true);
    expect(parsed.session.messages.some((message) => message.toolCalls?.some((tool) => tool.id === 'toolu-1'))).toBe(true);
    expect(parsed.session.messages.some((message) => message.toolCalls?.some((tool) => tool.displayName === 'search'))).toBe(true);
    expect(parsed.session.acp?.updates.some((update) => update.sessionUpdate === 'tool_call')).toBe(true);
  });

  it('reads Gemini tool parts from displayContent when content is plain text', async () => {
    const parsed = await parseSessionContent(geminiDisplayContentFixture, 'gemini-display.json');
    const assistantMessage = parsed.session.messages.find((message) => message.role === 'assistant');

    expect(parsed.session.platform).toBe('gemini');
    expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(assistantMessage?.toolCalls?.[0]?.id).toBe('toolu-2');
    expect(assistantMessage?.toolCalls?.[0]?.result).toBe('display result');
    expect(assistantMessage?.content).toContain('working on it');
  });

  it('prefers structured Gemini parts over duplicated toolCalls metadata', async () => {
    const parsed = await parseSessionContent(geminiPreferredToolCallsFixture, 'gemini-preferred.json');
    const assistantMessage = parsed.session.messages.find((message) => message.role === 'assistant');
    const toolCall = assistantMessage?.toolCalls?.[0];
    const toolItem = parsed.session.items?.find((item) => item.kind === 'tool_call');

    expect(parsed.session.platform).toBe('gemini');
    expect(toolCall?.arguments).toBe(JSON.stringify({ query: 'parts-query' }));
    expect(toolItem?.arguments).toBe(JSON.stringify({ query: 'parts-query' }));
    expect(toolItem?.content).toContain('[function_call] search');
  });
});
