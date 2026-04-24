import { describe, expect, it } from 'vitest';
import { deriveSessionItems, groupSessionItems } from '../../src/session/items.js';
import type { Session } from '../../src/session/types.js';

const session: Session = {
  id: 'session-items-1',
  platform: 'codex',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      timestamp: '2026-04-20T10:01:00.000Z',
      metadata: {
        thoughts: ['first thought', { text: 'second thought' }],
      },
      toolCalls: [
        {
          id: 'call-1',
          name: 'exec_command',
          arguments: '{"cmd":"echo hi"}',
          result: 'hi',
        },
      ],
    },
  ],
};

describe('session items', () => {
  it('keeps reasoning items and groups tool results with their message', () => {
    const items = deriveSessionItems(session);
    const kinds = items.map((item) => item.kind);

    expect(kinds).toContain('reasoning');
    expect(kinds).toContain('tool_call');
    expect(kinds).toContain('tool_result');

    const toolResult = items.find((item) => item.kind === 'tool_result');
    const toolCall = items.find((item) => item.kind === 'tool_call');
    expect(toolResult?.messageId).toBe('assistant-1');
    expect(groupSessionItems(items)).toHaveLength(1);
    expect(toolCall?.messageId).toBe(toolResult?.messageId);
  });
});
