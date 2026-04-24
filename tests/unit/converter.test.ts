import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { convertSession, convertSessionFile } from '../../src/session/converter.js';
import type { AcpTranscript } from '../../src/acp/transcript.js';
import { parseSessionContent } from '../../src/session/parser.js';
import { serializeSession } from '../../src/session/serializer.js';
import type { Platform, Session } from '../../src/session/types.js';
import { discoverSessionFiles, writeTextFile } from '../../src/utils/file-system.js';

const workspaceRoot = '/Users/hieunguyen/Coding/logitropic/claude-code';
const sourceSessionId = 'abc123xyz456';
const createdAt = '2026-04-20T10:00:00.000Z';
const updatedAt = '2026-04-20T10:05:00.000Z';
const messageTimestamps = ['2026-04-20T10:01:00.000Z', '2026-04-20T10:02:00.000Z'];

function sanitizeClaudeProjectPath(cwd: string): string {
  const sanitized = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 200) {
    return sanitized || 'project';
  }

  const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 12);
  return `${sanitized.slice(0, 200)}-${hash}`;
}

function getGeminiProjectIdentifier(cwd: string): string {
  return cwd
    .split(path.sep)
    .filter(Boolean)
    .at(-1)!
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'project';
}

function getGeminiProjectHash(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex');
}

function getGeminiSessionFileName(sessionId: string): string {
  const compact = sessionId.replace(/[^a-zA-Z0-9]/g, '');
  const shortId = compact.length >= 8 ? compact.slice(0, 8).toLowerCase() : '00000000';
  return `session-${createdAt.slice(0, 16).replace(/:/g, '-')}-${shortId}.json`;
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

function createCodexStateDb(codexHome: string): void {
  const db = new DatabaseSync(path.join(codexHome, 'state_5.sqlite'));
  try {
    db.exec(`
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  cwd TEXT NOT NULL,
  title TEXT NOT NULL,
  sandbox_policy TEXT NOT NULL,
  approval_mode TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  has_user_event INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  git_sha TEXT,
  git_branch TEXT,
  git_origin_url TEXT,
  cli_version TEXT NOT NULL DEFAULT '',
  first_user_message TEXT NOT NULL DEFAULT '',
  memory_mode TEXT NOT NULL DEFAULT 'enabled',
  model TEXT,
  reasoning_effort TEXT,
  agent_nickname TEXT,
  agent_role TEXT,
  agent_path TEXT
);
    `);
  } finally {
    db.close();
  }
}

function buildSourceSession(platform: Platform): Session {
  const common = {
    id: sourceSessionId,
    platform,
    createdAt,
    updatedAt,
    title: 'Workspace chat',
    cwd: workspaceRoot,
    messages: [
      {
        id: 'm1',
        role: 'user' as const,
        content: 'hello world',
        timestamp: messageTimestamps[0],
        metadata: {},
      },
      {
        id: 'm2',
        role: 'assistant' as const,
        content: 'response',
        timestamp: messageTimestamps[1],
        metadata: {},
      },
    ],
  };

  if (platform === 'claude-code') {
    return {
      ...common,
      metadata: { cwd: workspaceRoot },
    };
  }

  if (platform === 'codex') {
    return {
      ...common,
      metadata: {
        originator: 'session-history-converter',
        model_provider: 'anthropic',
        source: 'cli',
      },
    };
  }

  return {
    ...common,
    metadata: {
      projectHash: getGeminiProjectHash(workspaceRoot),
      directories: [workspaceRoot],
      kind: 'main',
    },
  };
}

function buildToolSourceSession(): Session {
  return {
    id: `${sourceSessionId}-tools`,
    platform: 'codex',
    createdAt,
    updatedAt,
    title: 'Tool session',
    cwd: workspaceRoot,
    messages: [
      {
        id: 'tool-user',
        role: 'user',
        content: 'run a command',
        timestamp: messageTimestamps[0],
        metadata: {},
      },
      {
        id: 'tool-assistant',
        role: 'assistant',
        content: 'I will run a command.',
        timestamp: messageTimestamps[1],
        toolCalls: [
          {
            id: 'call-1',
            name: 'exec_command',
            arguments: '{"cmd":"echo test"}',
            result: 'test',
          },
        ],
        metadata: {},
      },
    ],
    metadata: {
      originator: 'codex-tui',
      model_provider: 'openai',
      source: 'cli',
    },
  };
}

function buildOrphanToolSourceSession(): Session {
  const acp: AcpTranscript = {
    sessionInfo: {
      sessionId: `${sourceSessionId}-orphan-tools`,
      cwd: workspaceRoot,
      title: 'Orphan tool session',
      updatedAt,
    },
    updates: [
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-orphan-1',
        title: 'exec_command',
        kind: 'execute',
        rawInput: { cmd: 'echo orphan' },
        status: 'in_progress',
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-orphan-1',
        title: 'exec_command',
        kind: 'execute',
        rawOutput: 'orphan result',
        status: 'failed',
      },
    ],
    metadata: {
      originator: 'codex-tui',
      model_provider: 'openai',
      source: 'cli',
    },
  };

  return {
    id: `${sourceSessionId}-orphan-tools`,
    platform: 'codex',
    createdAt,
    updatedAt,
    title: 'Orphan tool session',
    cwd: workspaceRoot,
    messages: [
      {
        id: 'orphan-user',
        role: 'user',
        content: 'run an orphan tool call',
        timestamp: messageTimestamps[0],
        metadata: {},
      },
    ],
    acp,
    metadata: {
      originator: 'codex-tui',
      model_provider: 'openai',
      source: 'cli',
    },
  };
}

function buildRunningBashSession(): Session {
  return {
    id: `${sourceSessionId}-running-bash`,
    platform: 'codex',
    createdAt,
    updatedAt,
    title: 'Running bash session',
    cwd: workspaceRoot,
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'run a long command',
        timestamp: messageTimestamps[0],
        metadata: {},
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Running the command now.',
        timestamp: messageTimestamps[1],
        toolCalls: [
          {
            id: 'call-exec',
            name: 'exec_command',
            arguments: '{"cmd":"npm run dev","yield_time_ms":1000}',
            result: 'Process running with session ID 20869',
          },
          {
            id: 'call-stdin',
            name: 'write_stdin',
            arguments: '{"session_id":20869,"chars":"","yield_time_ms":1000}',
            result: 'server ready',
          },
        ],
        metadata: {},
      },
    ],
    metadata: {
      originator: 'codex-tui',
      model_provider: 'openai',
      source: 'cli',
    },
  };
}

function buildUnsupportedToolSourceSession(): Session {
  return {
    id: `${sourceSessionId}-unsupported-tools`,
    platform: 'codex',
    createdAt,
    updatedAt,
    title: 'Unsupported tools session',
    cwd: workspaceRoot,
    messages: [
      {
        id: 'user-unsupported',
        role: 'user',
        content: 'apply a patch and search the web',
        timestamp: messageTimestamps[0],
        metadata: {},
      },
      {
        id: 'assistant-unsupported',
        role: 'assistant',
        content: 'Using unsupported tools for conversion coverage.',
        timestamp: messageTimestamps[1],
        toolCalls: [
          {
            id: 'call-patch',
            name: 'apply_patch',
            arguments: '*** Begin Patch\n*** Add File: sample.txt\n+hello\n*** End Patch\n',
            result: 'Success. Updated the following files:\nA sample.txt',
          },
          {
            id: 'call-search',
            name: 'web_search',
            arguments: '{"type":"search","query":"claude code bash tool transcript"}',
            result: '{"results":[{"title":"Claude Code docs"}]}',
          },
        ],
        metadata: {},
      },
    ],
    metadata: {
      originator: 'codex-tui',
      model_provider: 'openai',
      source: 'cli',
    },
  };
}

describe('conversion', () => {
  it.each([
    ['claude-code', 'codex'],
    ['claude-code', 'gemini'],
    ['codex', 'claude-code'],
    ['codex', 'gemini'],
    ['gemini', 'claude-code'],
    ['gemini', 'codex'],
  ] as Array<[Platform, Platform]>)(
    'converts %s sessions to %s with native output paths',
    async (sourcePlatform, targetPlatform) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
      const sourceSession = buildSourceSession(sourcePlatform);
      const serializedSource = await serializeSession(sourceSession, sourcePlatform);
      const sourcePath = path.join(dir, `source.${serializedSource.extension}`);

      await writeTextFile(sourcePath, serializedSource.content);

      const result = await convertSessionFile({
        sourcePath,
        targetPlatform,
        outputDir: dir,
      });

      const convertedContent = await readFile(result.outputPath, 'utf8');
      const parsed = await parseSessionContent(convertedContent, result.outputPath);

      expect(parsed.session.platform).toBe(targetPlatform);
      expect(parsed.session.messages.length).toBeGreaterThanOrEqual(sourceSession.messages.length);
      for (const sourceMessage of sourceSession.messages) {
        expect(parsed.session.messages.some((message) => message.content.includes(sourceMessage.content))).toBe(true);
      }

      if (targetPlatform === 'claude-code') {
        const lines = getJsonLines(convertedContent);
        const transcriptLine = lines[1];
        expect(transcriptLine).toBeDefined();
        expect(transcriptLine?.message).toBeDefined();
        expect((transcriptLine?.message as Record<string, unknown>)?.content).toBe(sourceSession.messages[0]?.content);
        expect(Object.keys(transcriptLine ?? {}).slice(0, 2)).toEqual(['parentUuid', 'isSidechain']);
        expect(transcriptLine?.parentUuid).toBeNull();
        expect(transcriptLine?.isSidechain).toBe(false);
        const expectedPath = path.join(
          dir,
          sanitizeClaudeProjectPath(workspaceRoot),
          `${sourceSessionId}.jsonl`,
        );
        expect(result.outputPath).toBe(expectedPath);
      }

      if (targetPlatform === 'codex') {
        expect(result.session.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        const expectedPath = path.join(
          dir,
          '2026',
          '04',
          '20',
          `rollout-2026-04-20T10-00-00-${result.session.id}.jsonl`,
        );
        expect(result.outputPath).toBe(expectedPath);
      }

      if (targetPlatform === 'gemini') {
        const expectedPath = path.join(
          dir,
          getGeminiProjectIdentifier(workspaceRoot),
          'chats',
          getGeminiSessionFileName(sourceSessionId),
        );
        expect(result.outputPath).toBe(expectedPath);
      }
    },
  );

  it.each(['claude-code', 'gemini'] as Platform[])(
    'preserves Codex tool items when converting to %s',
    async (targetPlatform) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
      const sourceSession = buildToolSourceSession();
      const serializedSource = await serializeSession(sourceSession, 'codex');
      const sourcePath = path.join(dir, `source.${serializedSource.extension}`);

      await writeTextFile(sourcePath, serializedSource.content);

      const result = await convertSessionFile({
        sourcePath,
        targetPlatform,
        outputDir: dir,
      });

      const convertedContent = await readFile(result.outputPath, 'utf8');
      const parsed = await parseSessionContent(convertedContent, result.outputPath);

      expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
      expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
      expect(parsed.session.messages.some((message) => message.content.includes('run a command'))).toBe(true);

      if (targetPlatform === 'claude-code') {
        expect(convertedContent).toContain('"type":"tool_use"');
        expect(convertedContent).toContain('"type":"tool_result"');
        expect(convertedContent).not.toContain('"toolCalls"');
        expect(convertedContent).toContain('"name":"Bash"');
        expect(convertedContent).not.toContain('"name":"exec_command"');

        const lines = getJsonLines(convertedContent);
        const assistantTextLine = lines.find(
          (line) =>
            line.type === 'assistant' &&
            Array.isArray((line.message as Record<string, unknown>)?.content) &&
            ((line.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>).some(
              (part) => part.type === 'text' && part.text === 'I will run a command.',
            ),
        );
        const assistantLine = lines.find(
          (line) =>
            line.type === 'assistant' &&
            Array.isArray((line.message as Record<string, unknown>)?.content) &&
            ((line.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>).some(
              (part) => part.type === 'tool_use',
            ),
        );
        const userToolResultLine = lines.find(
          (line) =>
            line.type === 'user' &&
            Array.isArray((line.message as Record<string, unknown>)?.content) &&
            ((line.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>).some(
              (part) => part.type === 'tool_result',
            ),
        );

        expect(assistantLine).toBeDefined();
        expect(assistantTextLine).toBeDefined();
        expect((assistantLine?.message as Record<string, unknown>)?.type).toBe('message');
        expect(typeof (assistantLine?.message as Record<string, unknown>)?.id).toBe('string');
        expect(Array.isArray((assistantLine?.message as Record<string, unknown>)?.content)).toBe(true);
        expect(((assistantLine?.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>)).toEqual([
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'Bash',
            input: {
              command: 'echo test',
            },
          },
        ]);
        expect(Object.keys(assistantLine ?? {}).slice(0, 2)).toEqual(['parentUuid', 'isSidechain']);
        expect(userToolResultLine).toBeDefined();
        expect(userToolResultLine?.sourceToolAssistantUUID).toBe(assistantLine?.uuid);
        expect(userToolResultLine?.toolUseResult).toEqual(
          expect.objectContaining({
            stdout: 'test',
          }),
        );
        expect(userToolResultLine?.promptId).toBeDefined();
      }

      if (targetPlatform === 'gemini') {
        expect(convertedContent).toContain('"toolCalls"');
        const parsedGeminiRecord = JSON.parse(convertedContent) as {
          summary?: string;
          kind?: string;
          directories?: string[];
          messages?: Array<{ content?: string | Array<Record<string, unknown>>; displayContent?: Array<Record<string, unknown>>; toolCalls?: Array<Record<string, unknown>> }>;
        };
        const geminiMessages = parsedGeminiRecord.messages ?? [];
        expect(parsedGeminiRecord.summary).toBe('run a command');
        expect(parsedGeminiRecord.kind).toBeUndefined();
        expect(parsedGeminiRecord.directories).toBeUndefined();
        expect(
          geminiMessages.some(
            (message) => Array.isArray(message.content) && message.content.some((part) => 'text' in part && (part.text as string).includes('run a command')),
          ),
        ).toBe(true);
        expect(
          geminiMessages.some(
            (message) =>
              Array.isArray(message.content) &&
              message.content.some((part) => 'functionCall' in part || 'functionResponse' in part),
          ),
        ).toBe(false);
        expect(geminiMessages.some((message) => message.displayContent)).toBe(false);
        const geminiToolMessage = geminiMessages.find(
          (message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0,
        );
        expect(geminiToolMessage).toBeDefined();
        expect(geminiToolMessage?.toolCalls?.[0]).toMatchObject({
          id: 'call-1',
          name: 'exec_command',
          status: 'success',
          displayName: 'exec_command',
          description: expect.stringContaining('echo test'),
          renderOutputAsMarkdown: true,
          resultDisplay: 'test',
        });
        expect(geminiToolMessage?.toolCalls?.[0]?.args).toEqual({ cmd: 'echo test' });
        expect(geminiToolMessage?.toolCalls?.[0]?.result).toEqual([
          {
            functionResponse: {
              id: 'call-1',
              name: 'exec_command',
              response: {
                output: 'test',
              },
            },
          },
        ]);
        const parsedGeminiAssistant = parsed.session.messages.find((message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0);
        expect(parsedGeminiAssistant?.toolCalls?.[0]).toMatchObject({
          id: 'call-1',
          name: 'exec_command',
          displayName: 'exec_command',
          description: expect.stringContaining('echo test'),
          renderOutputAsMarkdown: true,
          resultDisplay: 'test',
          status: 'success',
          result: 'test',
        });
      }
    },
  );

  it('converts Claude Code tool transcripts to Codex without verification failures', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
    const sourceSession = {
      ...buildToolSourceSession(),
      platform: 'claude-code' as const,
    };
    const serializedSource = await serializeSession(sourceSession, 'claude-code');
    const sourcePath = path.join(dir, `source.${serializedSource.extension}`);

    await writeTextFile(sourcePath, serializedSource.content);

    const result = await convertSessionFile({
      sourcePath,
      targetPlatform: 'codex',
      outputDir: dir,
    });

    const convertedContent = await readFile(result.outputPath, 'utf8');
    const parsed = await parseSessionContent(convertedContent, result.outputPath);
    const discovered = await discoverSessionFiles([dir]);

    expect(parsed.session.platform).toBe('codex');
    expect(parsed.session.items?.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(parsed.session.items?.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(discovered.some((entry) => entry.path === result.outputPath && entry.platform === 'codex')).toBe(true);
  });

  it('does not duplicate tool results as user messages when converting Claude Code to Gemini', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
    const sourceSession = {
      ...buildToolSourceSession(),
      platform: 'claude-code' as const,
    };
    const serializedSource = await serializeSession(sourceSession, 'claude-code');
    const sourcePath = path.join(dir, `source.${serializedSource.extension}`);

    await writeTextFile(sourcePath, serializedSource.content);

    const result = await convertSessionFile({
      sourcePath,
      targetPlatform: 'gemini',
      outputDir: dir,
    });

    const parsedGeminiRecord = JSON.parse(result.content) as {
      messages?: Array<{
        type?: string;
        content?: Array<Record<string, unknown>>;
        toolCalls?: Array<Record<string, unknown>>;
      }>;
    };
    const geminiMessages = parsedGeminiRecord.messages ?? [];

    expect(
      geminiMessages.some(
        (message) =>
          message.type === 'user' &&
          Array.isArray(message.content) &&
          message.content.some((part) => typeof part.text === 'string' && part.text.includes('test')),
      ),
    ).toBe(false);

    const toolMessage = geminiMessages.find((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0);
    expect(toolMessage?.toolCalls?.[0]).toMatchObject({
      id: 'call-1',
      resultDisplay: 'test',
      result: [
        {
          functionResponse: {
            id: 'call-1',
            name: 'Bash',
            response: {
              output: 'test',
            },
          },
        },
      ],
    });
  });

  it('restores orphaned Codex tool items when converting to Gemini', async () => {
    const sourceSession = buildOrphanToolSourceSession();
    const converted = await convertSession(sourceSession, 'gemini');
    const serialized = await serializeSession(converted, 'gemini');
    const parsedGeminiRecord = JSON.parse(serialized.content) as {
      messages?: Array<{ content?: Array<Record<string, unknown>>; toolCalls?: Array<Record<string, unknown>> }>;
    };

    const geminiMessages = parsedGeminiRecord.messages ?? [];
    const geminiAssistant = converted.messages.find((message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0);

    expect(geminiAssistant?.toolCalls?.[0]).toMatchObject({
      id: 'call-orphan-1',
      name: 'exec_command',
      displayName: 'exec_command',
      description: expect.stringContaining('echo orphan'),
      renderOutputAsMarkdown: true,
      result: 'orphan result',
      status: 'error',
    });
    expect(
      geminiMessages.some(
        (message) =>
          Array.isArray(message.toolCalls) &&
          message.toolCalls.some((toolCall) => toolCall.id === 'call-orphan-1'),
      ),
    ).toBe(true);
    const toolCall = geminiMessages.flatMap((message) => message.toolCalls ?? []).find((entry) => entry.id === 'call-orphan-1');
    expect(toolCall?.result).toEqual([
      {
        functionResponse: {
          id: 'call-orphan-1',
          name: 'exec_command',
          response: {
            output: 'orphan result',
          },
        },
      },
    ]);
  });

  it('reuses the originating exec_command for write_stdin Bash entries in Claude Code', async () => {
    const serialized = await serializeSession(buildRunningBashSession(), 'claude-code');
    const lines = getJsonLines(serialized.content);
    const toolUseLines = lines.filter(
      (line) =>
        line.type === 'assistant' &&
        Array.isArray((line.message as Record<string, unknown>)?.content) &&
        ((line.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>).some(
          (part) => part.type === 'tool_use',
        ),
    );

    expect(toolUseLines).toHaveLength(2);
    expect(JSON.stringify(toolUseLines[0])).toContain('"command":"npm run dev"');
    expect(JSON.stringify(toolUseLines[1])).toContain('"command":"npm run dev"');
    expect(JSON.stringify(toolUseLines[1])).toContain('Polled session 20869');
    expect(JSON.stringify(toolUseLines[1])).not.toContain('write_stdin 20869');
  });

  it('keeps unsupported tool calls visible when converting to Claude Code and Codex', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'session-history-converter-'));
    const sourceSession = buildUnsupportedToolSourceSession();
    const serializedSource = await serializeSession(sourceSession, 'codex');
    const sourcePath = path.join(dir, `source.${serializedSource.extension}`);

    await writeTextFile(sourcePath, serializedSource.content);

    const claudeResult = await convertSessionFile({
      sourcePath,
      targetPlatform: 'claude-code',
      outputDir: dir,
    });
    const claudeContent = await readFile(claudeResult.outputPath, 'utf8');
    const claudeLines = getJsonLines(claudeContent);

    expect(claudeContent).not.toContain('Used unsupported Codex tool');
    expect(claudeContent).toContain('"type":"tool_use"');
    expect(claudeContent).toContain('"name":"apply_patch"');
    expect(claudeContent).toContain('"name":"WebSearch"');
    expect(claudeLines.some((line) => JSON.stringify(line).includes('*** Begin Patch'))).toBe(true);
    expect(claudeLines.some((line) => JSON.stringify(line).includes('claude code bash tool transcript'))).toBe(true);

    const codexResult = await convertSessionFile({
      sourcePath,
      targetPlatform: 'codex',
      outputDir: dir,
    });
    const codexContent = await readFile(codexResult.outputPath, 'utf8');
    const codexLines = getJsonLines(codexContent);
    const customCall = codexLines.find(
      (line) => line.type === 'response_item' && (line.payload as Record<string, unknown>)?.type === 'custom_tool_call',
    );
    const webSearchCall = codexLines.find(
      (line) => line.type === 'response_item' && (line.payload as Record<string, unknown>)?.type === 'web_search_call',
    );

    expect(customCall).toBeDefined();
    expect((customCall?.payload as Record<string, unknown>)?.name).toBe('apply_patch');
    expect((customCall?.payload as Record<string, unknown>)?.input).toContain('*** Begin Patch');
    expect(webSearchCall).toBeDefined();
    expect((webSearchCall?.payload as Record<string, unknown>)?.action).toEqual(
      expect.objectContaining({
        type: 'search',
        query: expect.stringContaining('claude code bash tool transcript') as unknown,
      }),
    );
  });

  it('syncs converted Codex sessions into the Codex state index', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'session-history-codex-state-'));
    const codexHome = path.join(tempRoot, '.codex');
    const sessionsDir = path.join(codexHome, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
    createCodexStateDb(codexHome);

    const sourceSession: Session = {
      id: 'claude-source-1',
      platform: 'claude-code',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
      title: 'Workspace chat',
      cwd: workspaceRoot,
      messages: [
        {
          id: 'source-user',
          role: 'user',
          content: 'hello world',
          timestamp: '2026-04-20T10:01:00.000Z',
          metadata: {},
        },
        {
          id: 'source-assistant',
          role: 'assistant',
          content: 'response',
          timestamp: '2026-04-20T10:02:00.000Z',
          metadata: {},
        },
      ],
      metadata: {
        cwd: workspaceRoot,
        originator: 'claude-code',
        model_provider: 'anthropic',
      },
    };

    const serializedSource = await serializeSession(sourceSession, 'claude-code');
    const sourcePath = path.join(tempRoot, `source.${serializedSource.extension}`);
    await writeTextFile(sourcePath, serializedSource.content);

    const result = await convertSessionFile({
      sourcePath,
      targetPlatform: 'codex',
      outputDir: sessionsDir,
    });

    const convertedContent = await readFile(result.outputPath, 'utf8');
    const firstLine = getFirstJsonLine(convertedContent);
    expect(firstLine.payload).toEqual(
      expect.objectContaining({
        model_provider: 'openai',
        originator: 'Codex Desktop',
        source: 'vscode',
      }),
    );

    const db = new DatabaseSync(path.join(codexHome, 'state_5.sqlite'));
    try {
      const row = db
        .prepare(
          `
SELECT
  id,
  rollout_path,
  cwd,
  source,
  model_provider,
  title,
  first_user_message
FROM threads
WHERE id = ?
          `,
        )
        .get(result.session.id) as
        | {
            id: string;
            rollout_path: string;
            cwd: string;
            source: string;
            model_provider: string;
            title: string;
            first_user_message: string;
          }
        | undefined;

      expect(row).toEqual(
        expect.objectContaining({
          id: result.session.id,
          rollout_path: result.outputPath,
          cwd: workspaceRoot,
          source: 'vscode',
          model_provider: 'openai',
          title: 'Workspace chat',
          first_user_message: 'hello world',
        }),
      );
    } finally {
      db.close();
    }
  });
});
