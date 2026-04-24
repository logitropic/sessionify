import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Session, SessionFile } from '../../session/types.js';
import { expandHomePath } from '../../utils/file-system.js';

export type WorkspaceScopedSession = {
  sessionFile: SessionFile;
  session: Session;
};

function normalizePath(inputPath: string): string {
  return path.resolve(expandHomePath(inputPath));
}

export function getWorkspaceRoot(inputPath = process.cwd()): string {
  return normalizePath(inputPath);
}

export function isPathWithinWorkspace(candidatePath: string, workspaceRoot: string): boolean {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRoot = normalizePath(workspaceRoot);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getSessionWorkspacePaths(session: Session): string[] {
  const workspacePaths = new Set<string>();

  if (typeof session.cwd === 'string' && session.cwd.trim()) {
    workspacePaths.add(session.cwd);
  }

  const metadata = session.metadata;
  if (metadata && typeof metadata === 'object') {
    const candidateDirectories = (metadata as { directories?: unknown }).directories;
    if (Array.isArray(candidateDirectories)) {
      for (const directory of candidateDirectories) {
        if (typeof directory === 'string' && directory.trim()) {
          workspacePaths.add(directory);
        }
      }
    }

    const metadataCwd = (metadata as { cwd?: unknown }).cwd;
    if (typeof metadataCwd === 'string' && metadataCwd.trim()) {
      workspacePaths.add(metadataCwd);
    }
  }

  return [...workspacePaths];
}

function getProjectHash(workspaceRoot: string): string {
  return createHash('sha256').update(path.resolve(expandHomePath(workspaceRoot))).digest('hex');
}

export function isSessionWithinWorkspace(session: Session, workspaceRoot: string): boolean {
  const workspacePaths = getSessionWorkspacePaths(session);
  if (
    workspacePaths.some((candidatePath) =>
      isPathWithinWorkspace(candidatePath, workspaceRoot),
  )) {
    return true;
  }

  if (session.platform === 'gemini') {
    const metadata = session.metadata as { projectHash?: unknown } | undefined;
    const projectHash = typeof metadata?.projectHash === 'string' ? metadata.projectHash : '';
    if (projectHash && projectHash === getProjectHash(workspaceRoot)) {
      return true;
    }
  }

  return false;
}

export function filterSessionsByWorkspace(
  sessions: WorkspaceScopedSession[],
  workspaceRoot: string,
): WorkspaceScopedSession[] {
  return sessions.filter((entry) => isSessionWithinWorkspace(entry.session, workspaceRoot));
}
