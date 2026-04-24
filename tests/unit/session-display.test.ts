import { describe, expect, it } from 'vitest';
import type { Session, SessionFile } from '../../src/session/types.js';
import { buildAcpTranscriptFromSession } from '../../src/acp/transcript.js';
import {
  formatRelativeTime,
  getSessionDisplayDetails,
  getSessionDisplayTitle,
} from '../../src/tui/utils/session-display.js';

const sessionFile: SessionFile = {
  path: '/Users/hieunguyen/Coding/projects/legal-agent/frontend',
  platform: 'claude-code',
  format: { type: 'claude-code', variant: 'ndjson' },
  size: 255400,
  modifiedAt: new Date('2026-04-14T12:00:00.000Z'),
  sessionId: 'session-1',
};

const session: Session = {
  id: 'session-1',
  platform: 'claude-code',
  createdAt: '2026-04-14T11:00:00.000Z',
  updatedAt: '2026-04-14T12:00:00.000Z',
  title: 'Design the UI',
  messages: [
    {
      id: 'm1',
      role: 'assistant',
      content: 'sure',
      timestamp: '2026-04-14T11:10:00.000Z',
    },
    {
      id: 'm2',
      role: 'user',
      content: 'thiết kế lại toàn bộ giao diện của repo vào figma',
      timestamp: '2026-04-14T11:20:00.000Z',
    },
  ],
  metadata: {
    gitBranch: 'main',
  },
};

const acpSession: Session = {
  ...session,
  title: 'Fallback title',
  acp: (() => {
    const transcript = buildAcpTranscriptFromSession(session);
    return {
      ...transcript,
      updates: [
        {
          sessionUpdate: 'session_info_update',
          title: 'ACP title',
        },
        ...transcript.updates,
      ],
    };
  })(),
};

describe('session display helpers', () => {
  it('uses the session title when present', () => {
    expect(getSessionDisplayTitle(sessionFile, session)).toBe('Design the UI');
  });

  it('prefers ACP transcript title when available', () => {
    expect(getSessionDisplayTitle(sessionFile, acpSession)).toBe('ACP title');
  });

  it('falls back to the session id when no title is available', () => {
    expect(
      getSessionDisplayTitle(sessionFile, {
        ...session,
        title: '',
        acp: undefined,
      }),
    ).toBe('session-1');
  });

  it('formats the details row with relative time, branch, size, and path', () => {
    expect(
      getSessionDisplayDetails(sessionFile, session, new Date('2026-04-21T12:00:00.000Z')),
    ).toBe(
      '1 week ago · main · 249.4 KB · /Users/hieunguyen/Coding/projects/legal-agent/frontend',
    );
  });

  it('formats relative time in week granularity', () => {
    expect(
      formatRelativeTime(
        new Date('2026-04-14T12:00:00.000Z'),
        new Date('2026-04-21T12:00:00.000Z'),
      ),
    ).toBe('1 week ago');
  });
});
