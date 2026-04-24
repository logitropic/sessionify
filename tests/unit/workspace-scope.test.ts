import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Session, SessionFile } from '../../src/session/types.js';
import {
  filterSessionsByWorkspace,
  getWorkspaceRoot,
  isPathWithinWorkspace,
  isSessionWithinWorkspace,
} from '../../src/tui/utils/workspace-scope.js';

const workspaceRoot = '/Users/hieunguyen/Coding/logitropic/claude-code';

function getProjectHash(projectRoot: string): string {
  return createHash('sha256').update(projectRoot).digest('hex');
}

function createSessionFile(path: string, platform: SessionFile['platform']): SessionFile {
  return {
    path,
    platform,
    format: platform === 'gemini' ? { type: 'gemini', variant: 'json' } : { type: platform, variant: platform === 'claude-code' ? 'ndjson' : 'jsonl' },
    size: 100,
    modifiedAt: new Date('2026-04-20T10:00:00.000Z'),
    sessionId: path.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? 'session',
  };
}

describe('workspace scope filtering', () => {
  it('resolves the current process cwd by default', () => {
    expect(getWorkspaceRoot(process.cwd())).toBe(process.cwd());
  });

  it('accepts the current folder and subfolders', () => {
    expect(isPathWithinWorkspace('/Users/hieunguyen/Coding/logitropic/claude-code', workspaceRoot)).toBe(true);
    expect(isPathWithinWorkspace('/Users/hieunguyen/Coding/logitropic/claude-code/packages/app', workspaceRoot)).toBe(true);
    expect(isPathWithinWorkspace('/Users/hieunguyen/Coding/others/codex', workspaceRoot)).toBe(false);
  });

  it('filters sessions by cwd or directories metadata', () => {
    const claudeSessionFile = createSessionFile('/tmp/claude.jsonl', 'claude-code');
    const codexSessionFile = createSessionFile('/tmp/codex.jsonl', 'codex');
    const geminiSessionFile = createSessionFile('/tmp/gemini.json', 'gemini');

    const claudeSession: Session = {
      id: 'claude-1',
      platform: 'claude-code',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
          timestamp: '2026-04-20T10:01:00.000Z',
        },
      ],
      cwd: '/Users/hieunguyen/Coding/logitropic/claude-code',
    };

    const codexSession: Session = {
      id: 'codex-1',
      platform: 'codex',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
      messages: [
        {
          id: 'm2',
          role: 'user',
          content: 'outside',
          timestamp: '2026-04-20T10:01:00.000Z',
        },
      ],
      cwd: '/Users/hieunguyen/Coding/others/codex',
    };

    const geminiSession: Session = {
      id: 'gemini-1',
      platform: 'gemini',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
      messages: [
        {
          id: 'm3',
          role: 'user',
          content: 'hello',
          timestamp: '2026-04-20T10:01:00.000Z',
        },
      ],
      metadata: {
        directories: [
          '/Users/hieunguyen/Coding/logitropic/claude-code/packages/app',
          '/Users/hieunguyen/Coding/others/gemini-cli',
        ],
      },
    };

    const scoped = filterSessionsByWorkspace(
      [
        { sessionFile: claudeSessionFile, session: claudeSession },
        { sessionFile: codexSessionFile, session: codexSession },
        { sessionFile: geminiSessionFile, session: geminiSession },
      ],
      workspaceRoot,
    );

    expect(isSessionWithinWorkspace(claudeSession, workspaceRoot)).toBe(true);
    expect(isSessionWithinWorkspace(codexSession, workspaceRoot)).toBe(false);
    expect(isSessionWithinWorkspace(geminiSession, workspaceRoot)).toBe(true);
    expect(scoped.map((entry) => entry.session.id)).toEqual(['claude-1', 'gemini-1']);
  });

  it('keeps Gemini sessions scoped by project hash when cwd and directories are missing', () => {
    const geminiSessionFile = createSessionFile('/tmp/gemini.json', 'gemini');

    const geminiSession: Session = {
      id: 'gemini-2',
      platform: 'gemini',
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:05:00.000Z',
      messages: [
        {
          id: 'm4',
          role: 'user',
          content: 'hello',
          timestamp: '2026-04-20T10:01:00.000Z',
        },
      ],
      metadata: {
        projectHash: getProjectHash(workspaceRoot),
      },
    };

    expect(isSessionWithinWorkspace(geminiSession, workspaceRoot)).toBe(true);
    expect(
      filterSessionsByWorkspace(
        [{ sessionFile: geminiSessionFile, session: geminiSession }],
        workspaceRoot,
      ).map((entry) => entry.session.id),
    ).toEqual(['gemini-2']);
  });
});
