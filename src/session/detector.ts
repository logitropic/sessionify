import path from 'node:path';
import { DetectionResult, Platform, SessionFormat } from './types.js';
import { readTextFile, pathExists } from '../utils/file-system.js';

function formatForPlatform(platform: Platform): SessionFormat {
  switch (platform) {
    case 'claude-code':
      return { type: 'claude-code', variant: 'ndjson' };
    case 'codex':
      return { type: 'codex', variant: 'jsonl' };
    case 'gemini':
      return { type: 'gemini', variant: 'json' };
  }
}

function detectFromObject(value: Record<string, unknown>): DetectionResult | null {
  if (value.type === 'session_meta' || value.type === 'response_item' || value.type === 'event_msg') {
    return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.95 };
  }

  if (value.type === 'file-history-snapshot' || value.type === 'snapshot') {
    return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.98 };
  }

  if ('sessionId' in value && ('parentUuid' in value || 'promptId' in value || 'entrypoint' in value || 'userType' in value || 'isMeta' in value)) {
    return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.96 };
  }

  if (Array.isArray(value.messages) && ('created' in value || 'modified' in value || 'title' in value)) {
    return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.92 };
  }

  if ('originator' in value || 'model_provider' in value) {
    return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.88 };
  }

  if (
    Array.isArray(value.messages) &&
    'sessionId' in value &&
    'startTime' in value &&
    'lastUpdated' in value
  ) {
    return { platform: 'gemini', format: formatForPlatform('gemini'), confidence: 0.95 };
  }

  return null;
}

export async function detectSessionFormat(filePath: string, content?: string): Promise<DetectionResult | null> {
  if (!content && !(await pathExists(filePath))) {
    return null;
  }

  const rawContent = content ?? (await readTextFile(filePath));
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const detected = detectFromObject(parsed);
    if (detected) {
      return detected;
    }
  } catch {
    // Fall through to line-based detection.
  }

  const firstLine = trimmed.split(/\r?\n/)[0] ?? trimmed;
  try {
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    const lineCandidates = trimmed.split(/\r?\n/).slice(0, 8);
    let sawCodexMarker = false;

    for (const line of lineCandidates) {
      try {
        const candidate = JSON.parse(line) as Record<string, unknown>;
        if (Array.isArray(candidate.messages) && ('created' in candidate || 'modified' in candidate || 'title' in candidate)) {
          return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.92 };
        }

        if (candidate.type === 'file-history-snapshot' || candidate.type === 'snapshot') {
          return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.98 };
        }

        if (candidate.type === 'session_meta' || candidate.type === 'response_item' || candidate.type === 'event_msg') {
          return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.95 };
        }

        if ('sessionId' in candidate && ('parentUuid' in candidate || 'promptId' in candidate || 'entrypoint' in candidate || 'userType' in candidate || 'isMeta' in candidate)) {
          return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.96 };
        }

        if ('originator' in candidate || 'model_provider' in candidate) {
          sawCodexMarker = true;
        }

        if (
          Array.isArray(candidate.messages) &&
          'sessionId' in candidate &&
          'startTime' in candidate &&
          'lastUpdated' in candidate &&
          !('originator' in candidate || 'model_provider' in candidate)
        ) {
          return { platform: 'gemini', format: formatForPlatform('gemini'), confidence: 0.95 };
        }
      } catch {
        // Continue scanning the remaining lines.
      }
    }

    if (Array.isArray(parsed.messages) && ('created' in parsed || 'modified' in parsed || 'title' in parsed)) {
      return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.92 };
    }

    if ('originator' in parsed || 'model_provider' in parsed) {
      return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.9 };
    }

    if (
      Array.isArray(parsed.messages) &&
      'sessionId' in parsed &&
      'startTime' in parsed &&
      'lastUpdated' in parsed &&
      !('originator' in parsed || 'model_provider' in parsed)
    ) {
      return { platform: 'gemini', format: formatForPlatform('gemini'), confidence: 0.95 };
    }

    if (sawCodexMarker) {
      return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.9 };
    }
  } catch {
    // Fall through to extension hints.
  }

  const basename = path.basename(filePath);
  if (basename.endsWith('.jsonl')) {
    return { platform: 'codex', format: formatForPlatform('codex'), confidence: 0.55 };
  }

  if (basename.endsWith('.ndjson')) {
    return { platform: 'claude-code', format: formatForPlatform('claude-code'), confidence: 0.55 };
  }

  return null;
}
