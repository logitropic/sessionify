import { describe, expect, it } from 'vitest';
import {
  contentBlockSchema,
  sessionInfoSchema,
  sessionUpdateSchema,
  toolCallSchema,
  toolCallUpdateSchema,
} from '../../src/acp/schema.js';
import { buildAcpTranscriptFromSession } from '../../src/acp/transcript.js';
import type { Session } from '../../src/session/types.js';

describe('ACP schema', () => {
  it('parses content blocks in ACP shape', () => {
    expect(contentBlockSchema.parse({ type: 'text', text: 'hello' })).toEqual({
      type: 'text',
      text: 'hello',
    });
    expect(contentBlockSchema.parse({ type: 'resource_link', name: 'file', uri: 'file:///tmp/a' })).toMatchObject({
      type: 'resource_link',
      name: 'file',
      uri: 'file:///tmp/a',
    });
  });

  it('parses tool call and tool call update in ACP shape', () => {
    expect(
      toolCallSchema.parse({
        toolCallId: 'tool-1',
        title: 'Run command',
        kind: 'execute',
      }),
    ).toMatchObject({
      toolCallId: 'tool-1',
      title: 'Run command',
      kind: 'execute',
    });

    expect(
      toolCallUpdateSchema.parse({
        toolCallId: 'tool-1',
        status: 'completed',
      }),
    ).toMatchObject({
      toolCallId: 'tool-1',
      status: 'completed',
    });
  });

  it('builds ACP session updates from legacy session messages', () => {
    const session: Session = {
      id: 'legacy-1',
      platform: 'codex',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
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
          content: 'run tool',
          timestamp: '2026-04-20T10:02:00.000Z',
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
      metadata: {},
    };

    const transcript = buildAcpTranscriptFromSession(session);

    expect(transcript.sessionInfo.sessionId).toBe('legacy-1');
    expect(transcript.sessionInfo.cwd).toBe(process.cwd());
    expect(transcript.updates.some((update) => update.sessionUpdate === 'user_message_chunk')).toBe(true);
    expect(transcript.updates.some((update) => update.sessionUpdate === 'tool_call')).toBe(true);
    expect(transcript.updates.some((update) => update.sessionUpdate === 'tool_call_update')).toBe(true);
  });

  it('parses ACP session info', () => {
    expect(
      sessionInfoSchema.parse({
        sessionId: 'session-1',
        cwd: '/tmp/project',
        title: 'Example',
        updatedAt: '2026-04-20T10:00:00.000Z',
      }),
    ).toMatchObject({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      title: 'Example',
    });
  });

  it('parses ACP session updates', () => {
    expect(
      sessionUpdateSchema.parse({
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Run command',
      }),
    ).toMatchObject({
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-1',
    });
  });
});
