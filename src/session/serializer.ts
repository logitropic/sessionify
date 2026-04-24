import { SerializeResult, Session, Platform } from './types.js';
import { serializeClaudeCodeSession } from '../platform/claude-code-serializer.js';
import { serializeCodexSession } from '../platform/codex-serializer.js';
import { serializeGeminiSession } from '../platform/gemini-serializer.js';

function preservedNativeResult(session: Session, platform: Platform): SerializeResult | undefined {
  if (
    session.sourcePlatform !== platform ||
    session.platform !== platform ||
    session.isNativeUnchanged !== true ||
    typeof session.rawContent !== 'string'
  ) {
    return undefined;
  }

  switch (platform) {
    case 'claude-code':
      return {
        content: session.rawContent,
        platform,
        format: { type: 'claude-code', variant: 'ndjson' },
        extension: 'jsonl',
      };
    case 'codex':
      return {
        content: session.rawContent,
        platform,
        format: { type: 'codex', variant: 'jsonl' },
        extension: 'jsonl',
      };
    case 'gemini':
      return {
        content: session.rawContent,
        platform,
        format: { type: 'gemini', variant: 'json' },
        extension: 'json',
      };
  }
}

export async function serializeSession(session: Session, platform: Platform): Promise<SerializeResult> {
  const preserved = preservedNativeResult(session, platform);
  if (preserved) {
    return preserved;
  }

  switch (platform) {
    case 'claude-code':
      return serializeClaudeCodeSession(session);
    case 'codex':
      return serializeCodexSession(session);
    case 'gemini':
      return serializeGeminiSession(session);
    default:
      throw new Error(`Unsupported session platform: ${String(platform)}`);
  }
}
