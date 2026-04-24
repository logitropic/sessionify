import { describe, expect, it } from 'vitest';
import { serializeSession } from '../../src/session/serializer.js';
import { parseSessionContent } from '../../src/session/parser.js';
import { Platform, Session } from '../../src/session/types.js';

const session: Session = {
  id: 'session-1',
  platform: 'claude-code',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Sample',
  cwd: '/tmp/project',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'hello',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {},
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'world',
      timestamp: '2026-04-20T10:02:00.000Z',
      metadata: {},
    },
  ],
  metadata: {
    projectHash: 'abc',
    originator: 'claude-code',
    model_provider: 'anthropic',
  },
};

const toolSession: Session = {
  id: 'tool-session-1',
  platform: 'codex',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Tool Sample',
  cwd: '/tmp/project',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'run tool',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {},
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'done',
      timestamp: '2026-04-20T10:02:00.000Z',
      toolCalls: [
        {
          id: 'call-1',
          namespace: 'mcp__codex_apps__gmail',
          name: 'exec_command',
          arguments: '{"cmd":"false"}',
          result: 'Process failed',
          status: 'failed',
        },
      ],
      metadata: {},
    },
  ],
  metadata: {
    projectHash: 'abc',
    originator: 'codex-tui',
    model_provider: 'openai',
    source: 'cli',
  },
};

const claudeToolSession: Session = {
  id: 'claude-tool-session-1',
  platform: 'codex',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Claude tool sample',
  cwd: '/tmp/project',
  messages: [
    {
      id: 'm1',
      role: 'assistant',
      content: 'tools',
      timestamp: '2026-04-20T10:01:00.000Z',
      toolCalls: [
        {
          id: 'call-bash',
          name: 'Bash',
          arguments: '{"command":"echo hello"}',
          result: 'hello',
        },
        {
          id: 'call-read',
          name: 'Read',
          arguments: '{"path":"README.md"}',
        },
      ],
      metadata: {},
    },
  ],
  metadata: {
    projectHash: 'abc',
    originator: 'codex-tui',
    model_provider: 'openai',
    source: 'cli',
  },
};

const codexToolSearchSession: Session = {
  id: 'codex-tool-search-1',
  platform: 'codex',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Tool search sample',
  cwd: '/tmp/project',
  messages: [
    {
      id: 'm1',
      role: 'assistant',
      content: 'searching',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {},
    },
  ],
  items: [
    {
      id: 'item-1',
      kind: 'tool_call',
      messageId: 'm1',
      sequence: 0,
      role: 'assistant',
      name: 'tool_search',
      toolCallId: 'call-1',
      arguments: '{"arguments":{"query":"claude code"}}',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {
        responseType: 'tool_search_call',
        payload: {
          type: 'tool_search_call',
          execution: 'local',
        },
      },
    },
  ],
  metadata: {
    projectHash: 'abc',
    originator: 'codex-tui',
    model_provider: 'openai',
    source: 'cli',
  },
};

const codexNativeToolOutputSession: Session = {
  id: 'codex-native-tools-1',
  platform: 'codex',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Native tool outputs',
  cwd: '/tmp/project',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'please run tools',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {},
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'running tools',
      timestamp: '2026-04-20T10:02:00.000Z',
      toolCalls: [
        {
          id: 'patch-1',
          name: 'apply_patch',
          arguments: '*** Begin Patch\n*** Add File: sample.txt\n+hello\n*** End Patch\n',
          result: 'Success. Updated the following files:\nA sample.txt',
        },
        {
          id: 'search-1',
          name: 'web_search',
          arguments: '{"type":"search","query":"serializer"}',
          result: '{"results":[{"title":"Codex serializer"}]}',
        },
      ],
      metadata: {},
    },
  ],
  metadata: {
    projectHash: 'abc',
    originator: 'codex-tui',
    model_provider: 'openai',
    source: 'cli',
  },
};

const nativeClaudeFixture = [
  JSON.stringify({
    sessionId: 'claude-native-1',
    created: '2026-04-20T10:00:00.000Z',
    modified: '2026-04-20T10:04:00.000Z',
    cwd: '/tmp/project',
    title: 'Native Claude',
    messages: [],
    extraHeader: { keep: true },
  }),
  JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    uuid: 'claude-user-1',
    timestamp: '2026-04-20T10:01:00.000Z',
    sessionId: 'claude-native-1',
    cwd: '/tmp/project',
    message: { role: 'user', content: 'hello native' },
  }),
  JSON.stringify({
    parentUuid: 'claude-user-1',
    isSidechain: false,
    type: 'assistant',
    uuid: 'claude-assistant-1',
    timestamp: '2026-04-20T10:02:00.000Z',
    sessionId: 'claude-native-1',
    cwd: '/tmp/project',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'thinking native' },
        { type: 'text', text: 'hi back' },
        { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'echo hi' } },
      ],
      stop_reason: 'tool_use',
    },
  }),
  JSON.stringify({
    parentUuid: 'claude-assistant-1',
    isSidechain: false,
    type: 'user',
    uuid: 'claude-tool-result-1',
    timestamp: '2026-04-20T10:03:00.000Z',
    sessionId: 'claude-native-1',
    cwd: '/tmp/project',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'hi', is_error: false }],
    },
  }),
].join('\n') + '\n';

const nativeCodexFixture = [
  JSON.stringify({
    id: '019dae92-f019-7331-807d-af921356f768',
    timestamp: '2026-04-20T10:00:00.000Z',
    cwd: '/tmp/project',
    originator: 'codex',
    model_provider: 'openai',
    source: 'cli',
    extra_header: { keep: true },
  }),
  JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-04-20T10:01:00.000Z',
    payload: { type: 'user_message', message: 'hello codex', images: [], local_images: [], text_elements: [] },
  }),
  JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-04-20T10:02:00.000Z',
    payload: { type: 'agent_reasoning', text: 'thinking codex' },
  }),
  JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-04-20T10:03:00.000Z',
    payload: { type: 'agent_message', message: 'I will search', phase: 'commentary', memory_citation: null },
  }),
  JSON.stringify({
    type: 'response_item',
    timestamp: '2026-04-20T10:03:01.000Z',
    payload: {
      type: 'tool_search_call',
      name: 'tool_search',
      call_id: 'call-search-1',
      arguments: { query: 'serializer' },
      execution: 'local',
      namespace: 'tool_search',
    },
  }),
  JSON.stringify({
    type: 'response_item',
    timestamp: '2026-04-20T10:03:02.000Z',
    payload: { type: 'function_call_output', call_id: 'call-search-1', output: 'result' },
  }),
].join('\n') + '\n';

const nativeGeminiFixture = `${JSON.stringify(
  {
    sessionId: 'gemini-native-1',
    projectHash: 'project-hash',
    startTime: '2026-04-20T10:00:00.000Z',
    lastUpdated: '2026-04-20T10:04:00.000Z',
    summary: 'Native Gemini',
    messages: [
      {
        id: 'gemini-user-1',
        type: 'user',
        timestamp: '2026-04-20T10:01:00.000Z',
        content: [{ text: 'hello gemini' }],
      },
      {
        id: 'gemini-assistant-1',
        type: 'gemini',
        timestamp: '2026-04-20T10:02:00.000Z',
        thoughts: [{ text: 'thinking gemini' }],
        content: [
          { text: 'calling a tool' },
          { functionCall: { id: 'gemini-call-1', name: 'search', args: { query: 'serializer' } } },
          { functionResponse: { id: 'gemini-call-1', name: 'search', response: { output: 'found' } } },
        ],
      },
    ],
    extraTopLevel: { keep: true },
  },
  null,
  2,
)}\n`;

const nativeFixtures: Record<Platform, string> = {
  'claude-code': nativeClaudeFixture,
  codex: nativeCodexFixture,
  gemini: nativeGeminiFixture,
};

function otherPlatforms(platform: Platform): Platform[] {
  return (['claude-code', 'codex', 'gemini'] as Platform[]).filter((candidate) => candidate !== platform);
}

function parseGeminiMessages(content: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(content) as { messages?: Array<Record<string, unknown>> };
  return parsed.messages ?? [];
}

function getJsonLines(content: string): Record<string, unknown>[] {
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function getFirstJsonLine(content: string): Record<string, unknown> {
  return JSON.parse(content.trim().split(/\r?\n/)[0] ?? '{}') as Record<string, unknown>;
}

describe('session serialization', () => {
  it.each(['claude-code', 'codex', 'gemini'] as Platform[])(
    'preserves native %s content byte-for-byte when unchanged',
    async (platform) => {
      const parsed = await parseSessionContent(nativeFixtures[platform], `native.${platform === 'gemini' ? 'json' : 'jsonl'}`);
      const serialized = await serializeSession(parsed.session, platform);

      expect(serialized.content).toBe(nativeFixtures[platform]);
    },
  );

  it.each(['claude-code', 'codex', 'gemini'] as Platform[])(
    'serializes native %s sessions to every other platform with core canonical data intact',
    async (sourcePlatform) => {
      const parsed = await parseSessionContent(nativeFixtures[sourcePlatform], `native.${sourcePlatform === 'gemini' ? 'json' : 'jsonl'}`);

      for (const targetPlatform of otherPlatforms(sourcePlatform)) {
        const serialized = await serializeSession(
          {
            ...parsed.session,
            platform: targetPlatform,
            isNativeUnchanged: false,
            rawContent: undefined,
          },
          targetPlatform,
        );
        const reparsed = await parseSessionContent(serialized.content, `converted.${targetPlatform === 'gemini' ? 'json' : 'jsonl'}`);

        expect(reparsed.session.platform).toBe(targetPlatform);
        expect(reparsed.session.messages.some((message) => message.role === 'user')).toBe(true);
        expect(reparsed.session.messages.some((message) => message.role === 'assistant')).toBe(true);
        expect(reparsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);

        if (targetPlatform === 'gemini') {
          const geminiMessages = parseGeminiMessages(serialized.content);
          const toolMessage = geminiMessages.find((message) => Array.isArray(message.toolCalls));
          expect(toolMessage).toBeDefined();
          expect(toolMessage?.toolCalls).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String) as unknown,
                name: expect.any(String) as unknown,
                args: expect.anything() as unknown,
                status: expect.any(String) as unknown,
                result: expect.arrayContaining([
                  expect.objectContaining({
                    functionResponse: expect.any(Object) as unknown,
                  }),
                ]) as unknown,
              }),
            ]),
          );
        }
      }
    },
  );

  it('serializes to Claude Code and parses back', async () => {
    const serialized = await serializeSession(session, 'claude-code');
    expect(serialized.extension).toBe('jsonl');
    const parsed = await parseSessionContent(serialized.content, 'session.jsonl');
    expect(parsed.session.platform).toBe('claude-code');
    expect(parsed.session.messages).toHaveLength(2);
  });

  it('serializes to Codex', async () => {
    const serialized = await serializeSession(session, 'codex');
    const lines = getJsonLines(serialized.content);
    const messageLines = lines.filter(
      (line) => line.type === 'response_item' && (line.payload as Record<string, unknown>)?.type === 'message',
    );
    const eventLines = lines.filter(
      (line) =>
        line.type === 'event_msg' &&
        ((line.payload as Record<string, unknown>)?.type === 'user_message' ||
          (line.payload as Record<string, unknown>)?.type === 'agent_message'),
    );
    const firstLine = getFirstJsonLine(serialized.content);
    expect(firstLine.type).toBe('session_meta');
    expect(firstLine.payload).toEqual(
      expect.objectContaining({
        id: 'session-1',
        cwd: '/tmp/project',
        originator: 'Codex Desktop',
        source: 'vscode',
        model_provider: 'openai',
      }),
    );
    expect(messageLines).toHaveLength(2);
    expect(eventLines).toHaveLength(2);
    expect((messageLines[0]?.payload as Record<string, unknown>)?.role).toBe('user');
    expect((messageLines[1]?.payload as Record<string, unknown>)?.role).toBe('assistant');
    expect(((messageLines[0]?.payload as Record<string, unknown>)?.content as Array<Record<string, unknown>>)[0]).toEqual(
      expect.objectContaining({
        type: 'input_text',
        text: 'hello',
      }),
    );
    expect(((messageLines[1]?.payload as Record<string, unknown>)?.content as Array<Record<string, unknown>>)[0]).toEqual(
      expect.objectContaining({
        type: 'output_text',
        text: 'world',
      }),
    );

    const parsed = await parseSessionContent(serialized.content, 'codex-roundtrip.jsonl');
    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(parsed.session.messages[0]?.content).toBe('hello');
    expect(parsed.session.messages[1]?.content).toBe('world');
  });

  it('serializes tool-only Codex turns without leaking tool summaries into message text', async () => {
    const toolOnlySession: Session = {
      ...toolSession,
      messages: [
        toolSession.messages[0]!,
        {
          ...toolSession.messages[1]!,
          content: '',
        },
      ],
    };

    const serialized = await serializeSession(toolOnlySession, 'codex');
    const lines = getJsonLines(serialized.content);
    const assistantMessageLine = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'message' &&
        (line.payload as Record<string, unknown>)?.role === 'assistant',
    );

    expect(assistantMessageLine).toBeUndefined();

    const parsed = await parseSessionContent(serialized.content, 'codex-tool-only.jsonl');
    expect(parsed.session.messages).toHaveLength(2);
    expect(parsed.session.messages[1]?.toolCalls).toHaveLength(1);
    expect(parsed.session.messages[1]?.content).toBe('');
  });

  it('preserves tool namespace and error metadata in round trips', async () => {
    const codexSerialized = await serializeSession(toolSession, 'codex');
    expect(codexSerialized.content).toContain('"namespace":"mcp__codex_apps__gmail"');

    const claudeSerialized = await serializeSession(toolSession, 'claude-code');
    expect(claudeSerialized.content).toContain('"is_error":true');
  });

  it('serializes to Gemini', async () => {
    const serialized = await serializeSession(session, 'gemini');
    expect(serialized.content).toContain('"sessionId": "session-1"');
  });

  it('serializes multiple tool calls to Gemini toolCalls metadata without function parts in content', async () => {
    const serialized = await serializeSession(claudeToolSession, 'gemini');
    const geminiMessages = parseGeminiMessages(serialized.content);
    const toolMessage = geminiMessages.find((message) => Array.isArray(message.toolCalls));

    expect(toolMessage).toBeDefined();
    expect(toolMessage?.content).toEqual([{ text: 'tools' }]);
    expect(JSON.stringify(toolMessage?.content)).not.toContain('functionCall');
    expect(JSON.stringify(toolMessage?.content)).not.toContain('functionResponse');
    expect(toolMessage?.toolCalls).toHaveLength(2);
    expect(toolMessage?.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'call-bash',
          name: 'Bash',
          args: { command: 'echo hello' },
          status: 'success',
          displayName: 'Bash',
          description: expect.stringContaining('echo hello'),
          resultDisplay: 'hello',
          result: [
            {
              functionResponse: {
                id: 'call-bash',
                name: 'Bash',
                response: { output: 'hello' },
              },
            },
          ],
        }),
        expect.objectContaining({
          id: 'call-read',
          name: 'Read',
          args: { path: 'README.md' },
          status: 'executing',
          displayName: 'Read',
          description: expect.stringContaining('README.md'),
        }),
      ]),
    );
  });

  it('preserves standard Claude tool names', async () => {
    const serialized = await serializeSession(claudeToolSession, 'claude-code');
    expect(serialized.content).toContain('"name":"Bash"');
    expect(serialized.content).toContain('"name":"Read"');
  });

  it('serializes exec_command to Codex with native arguments', async () => {
    const serialized = await serializeSession(claudeToolSession, 'codex');
    const lines = getJsonLines(serialized.content);
    const shellCall = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call' &&
        (line.payload as Record<string, unknown>)?.name === 'exec_command',
    );
    const readCall = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call' &&
        (line.payload as Record<string, unknown>)?.name === 'Read',
    );

    expect(shellCall).toBeDefined();
    expect((shellCall?.payload as Record<string, unknown>)?.arguments).toContain('"cmd":"echo hello"');
    expect(readCall).toBeDefined();
    expect((readCall?.payload as Record<string, unknown>)?.arguments).toContain('README.md');
  });

  it('serializes Codex tool transcripts using response_item function calls and outputs', async () => {
    const serialized = await serializeSession(claudeToolSession, 'codex');
    const lines = getJsonLines(serialized.content);
    const execCall = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call' &&
        (line.payload as Record<string, unknown>)?.name === 'exec_command',
    );
    const execOutput = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call_output' &&
        (line.payload as Record<string, unknown>)?.call_id === 'call-bash',
    );
    const readCall = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call' &&
        (line.payload as Record<string, unknown>)?.name === 'Read',
    );
    const execEnd = lines.find(
      (line) =>
        line.type === 'event_msg' &&
        (line.payload as Record<string, unknown>)?.type === 'exec_command_end' &&
        (line.payload as Record<string, unknown>)?.call_id === 'call-bash',
    );
    const readRequest = lines.find(
      (line) =>
        line.type === 'event_msg' &&
        (line.payload as Record<string, unknown>)?.type === 'dynamic_tool_call_request' &&
        (line.payload as Record<string, unknown>)?.call_id === 'call-read',
    );

    expect(execCall).toBeDefined();
    expect((execCall?.payload as Record<string, unknown>)?.arguments).toContain('"cmd":"echo hello"');
    expect(execOutput).toBeDefined();
    expect((execOutput?.payload as Record<string, unknown>)?.output).toBe('hello');
    expect(readCall).toBeDefined();
    expect((readCall?.payload as Record<string, unknown>)?.arguments).toContain('README.md');
    expect(execEnd).toBeDefined();
    expect(readRequest).toBeDefined();
  });

  it('serializes Codex tool search calls as tool_search_call', async () => {
    const serialized = await serializeSession(codexToolSearchSession, 'codex');
    expect(serialized.content).toContain('"type":"tool_search_call"');
  });

  it('serializes Codex tool outputs with native output types', async () => {
    const serialized = await serializeSession(codexNativeToolOutputSession, 'codex');
    const lines = getJsonLines(serialized.content);
    const customOutput = lines.find(
      (line) => line.type === 'response_item' && (line.payload as Record<string, unknown>)?.type === 'custom_tool_call_output',
    );
    const searchOutput = lines.find(
      (line) =>
        line.type === 'response_item' &&
        (line.payload as Record<string, unknown>)?.type === 'function_call_output' &&
        (line.payload as Record<string, unknown>)?.call_id === 'search-1',
    );

    expect(customOutput).toBeDefined();
    expect((customOutput?.payload as Record<string, unknown>)?.call_id).toBe('patch-1');
    expect((customOutput?.payload as Record<string, unknown>)?.output).toContain('sample.txt');
    expect(searchOutput).toBeDefined();
    expect((searchOutput?.payload as Record<string, unknown>)?.call_id).toBe('search-1');
    expect((searchOutput?.payload as Record<string, unknown>)?.output).toContain('Codex serializer');
  });

  it('throws for unsupported platforms', async () => {
    await expect(serializeSession(session, 'unknown' as never)).rejects.toThrow(/Unsupported session platform/);
  });
});
