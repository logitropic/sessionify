import { describe, expect, it } from 'vitest';
import { parseGeminiSession } from '../../src/platform/gemini-parser.js';

describe('gemini parser', () => {
  it('throws a controlled error for invalid JSON', async () => {
    await expect(parseGeminiSession('{invalid json}', 'session.json')).rejects.toThrow(/Invalid Gemini session JSON/);
  });

  it('keeps assistant content when the message only has tool calls', async () => {
    const parsed = await parseGeminiSession(
      JSON.stringify({
        sessionId: 'gemini-tools-1',
        startTime: '2026-04-20T10:00:00.000Z',
        lastUpdated: '2026-04-20T10:05:00.000Z',
        messages: [
          {
            id: 'assistant-1',
            type: 'gemini',
            timestamp: '2026-04-20T10:01:00.000Z',
            content: [],
            toolCalls: [
              {
                id: 'call-1',
                name: 'Bash',
                args: { command: 'echo hello' },
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.session.messages[0]?.content).toContain('[function_call] Bash');
  });

  it('parses Gemini toolCalls metadata with functionResponse result parts', async () => {
    const parsed = await parseGeminiSession(
      JSON.stringify({
        sessionId: 'gemini-tools-result-1',
        startTime: '2026-04-20T10:00:00.000Z',
        lastUpdated: '2026-04-20T10:05:00.000Z',
        messages: [
          {
            id: 'assistant-1',
            type: 'gemini',
            timestamp: '2026-04-20T10:01:00.000Z',
            content: [{ text: 'running tool' }],
            toolCalls: [
              {
                id: 'call-1',
                name: 'Bash',
                args: { command: 'echo hello' },
                status: 'success',
                displayName: 'Run command',
                description: 'Runs shell commands',
                renderOutputAsMarkdown: true,
                resultDisplay: 'hello',
                result: [
                  {
                    functionResponse: {
                      id: 'call-1',
                      name: 'Bash',
                      response: { output: 'hello' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const toolCall = parsed.session.messages[0]?.toolCalls?.[0];
    const toolResult = parsed.session.items?.find((item) => item.kind === 'tool_result');

    expect(toolCall).toMatchObject({
      id: 'call-1',
      name: 'Bash',
      result: 'hello',
      resultDisplay: 'hello',
      displayName: 'Run command',
      description: 'Runs shell commands',
      renderOutputAsMarkdown: true,
    });
    expect(toolResult).toMatchObject({
      toolCallId: 'call-1',
      result: 'hello',
      content: 'hello',
    });
  });
});
