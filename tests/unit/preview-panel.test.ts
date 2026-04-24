import { describe, expect, it } from 'vitest';
import { buildPreviewSections } from '../../src/tui/preview-panel.js';
import { buildAcpTranscriptFromSession } from '../../src/acp/transcript.js';
import type { Session, SessionFile } from '../../src/session/types.js';

const sessionFile: SessionFile = {
  path: '/tmp/session.jsonl',
  platform: 'claude-code',
  format: { type: 'claude-code', variant: 'ndjson' },
  size: 120,
  modifiedAt: new Date('2026-04-20T10:00:00.000Z'),
  sessionId: 'session-1',
};

const session: Session = {
  id: 'session-1',
  platform: 'claude-code',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:05:00.000Z',
  title: 'Example',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'hello',
      timestamp: '2026-04-20T10:01:00.000Z',
    },
    {
      id: 'm2',
      role: 'assistant',
      content: '1  world\n2  from file\n3  line three\n4  line four',
      timestamp: '2026-04-20T10:02:00.000Z',
    },
  ],
};

const acpSession: Session = {
  ...session,
  acp: (() => {
    const transcript = buildAcpTranscriptFromSession(session);
    return {
      ...transcript,
      updates: [
        {
          sessionUpdate: 'session_info_update',
          title: 'ACP Example',
        },
        ...transcript.updates,
      ],
    };
  })(),
};

describe('preview panel', () => {
  it('renders metadata only', () => {
    const { metadataLines } = buildPreviewSections(sessionFile, session);

    expect(metadataLines).toEqual([
      'Title: Example',
      `Path: ${sessionFile.path}`,
      'Platform: claude-code',
      'Format: claude-code',
      'ACP Updates: 0',
      'ACP Messages: 0',
      'Created: 2026-04-20T10:00:00.000Z',
    ]);
  });

  it('prefers ACP metadata when available', () => {
    const { metadataLines } = buildPreviewSections(sessionFile, acpSession);

    expect(metadataLines).toEqual([
      'ACP Title: ACP Example',
      'Title: Example',
      `Path: ${sessionFile.path}`,
      'Platform: claude-code',
      'Format: claude-code',
      'ACP Updates: 3',
      'ACP Messages: 2',
      'Created: 2026-04-20T10:00:00.000Z',
    ]);
  });
});
