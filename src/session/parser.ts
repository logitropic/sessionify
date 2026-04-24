import { detectSessionFormat } from './detector.js';
import { ParseResult, Session } from './types.js';
import { parseClaudeCodeSession } from '../platform/claude-code-parser.js';
import { parseCodexSession } from '../platform/codex-parser.js';
import { parseGeminiSession } from '../platform/gemini-parser.js';
import { readTextFile } from '../utils/file-system.js';
import { buildAcpTranscriptFromSession } from '../acp/transcript.js';

export class SessionParseError extends Error {
  constructor(message: string, public readonly sourcePath?: string) {
    super(message);
    this.name = 'SessionParseError';
  }
}

export async function parseSessionContent(content: string, sourcePath?: string): Promise<ParseResult> {
  const detection = sourcePath ? await detectSessionFormat(sourcePath, content) : await detectSessionFormat('session', content);
  if (!detection) {
    throw new SessionParseError('Unsupported or unrecognized session format', sourcePath);
  }

  switch (detection.platform) {
    case 'claude-code':
      return parseClaudeCodeSession(content, sourcePath);
    case 'codex':
      return parseCodexSession(content, sourcePath);
    case 'gemini':
      return parseGeminiSession(content, sourcePath);
  }
}

export async function parseSessionFile(sourcePath: string): Promise<ParseResult> {
  return parseSessionContent(await readTextFile(sourcePath), sourcePath);
}

export function ensureSession(value: Session): Session {
  if (value.messages.length === 0) {
    throw new SessionParseError('Session must contain at least one message');
  }

  if (!value.acp) {
    return {
      ...value,
      acp: buildAcpTranscriptFromSession(value),
    };
  }

  return value;
}
