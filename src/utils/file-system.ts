import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { SessionFile, Platform, type Session } from '../session/types.js';
import { detectSessionFormat } from '../session/detector.js';

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function statFile(filePath: string): Promise<{
  size: number;
  modifiedAt: Date;
}> {
  const stats = await fs.stat(filePath);
  return { size: stats.size, modifiedAt: stats.mtime };
}

export function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function getGeminiHomeDir(): string {
  return process.env.GEMINI_CLI_HOME || os.homedir();
}

function sanitizeClaudeProjectPath(cwd: string): string {
  const sanitized = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 200) {
    return sanitized || 'project';
  }

  const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 12);
  return `${sanitized.slice(0, 200)}-${hash}`;
}

function formatCodexTimestamp(timestamp: string): {
  dateDir: string;
  fileTimestamp: string;
} {
  const date = new Date(timestamp);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear());
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  const fileTimestamp = safeDate
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, '-');

  return {
    dateDir: path.join(year, month, day),
    fileTimestamp,
  };
}

function getSessionWorkspacePath(session: Pick<Session, 'cwd' | 'metadata'>): string | undefined {
  if (session.cwd && session.cwd.trim()) {
    return session.cwd;
  }

  const metadata = session.metadata as
    | { directories?: unknown; cwd?: unknown; projectHash?: unknown }
    | undefined;

  if (metadata?.cwd && typeof metadata.cwd === 'string' && metadata.cwd.trim()) {
    return metadata.cwd;
  }

  if (Array.isArray(metadata?.directories)) {
    const firstDirectory = metadata.directories.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    if (firstDirectory) {
      return firstDirectory;
    }
  }

  return undefined;
}

function shortSessionId(sessionId: string): string {
  const compact = sessionId.replace(/[^a-zA-Z0-9]/g, '');
  if (compact.length >= 8) {
    return compact.slice(0, 8).toLowerCase();
  }

  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export function getDefaultSessionRoots(): Record<Platform, string> {
  const home = getGeminiHomeDir();
  return {
    'claude-code': path.join(home, '.claude', 'projects'),
    codex: path.join(home, '.codex', 'sessions'),
    gemini: path.join(home, '.gemini', 'tmp'),
  };
}

function slugifyGeminiProjectName(projectPath: string): string {
  const baseName = path.basename(projectPath);
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'project';

  return slug;
}

async function readGeminiProjectRegistry(): Promise<Record<string, string>> {
  const registryPath = path.join(getGeminiHomeDir(), '.gemini', 'projects.json');
  try {
    const raw = await fs.readFile(registryPath, 'utf8');
    const parsed = JSON.parse(raw) as { projects?: Record<string, string> };
    return parsed.projects ?? {};
  } catch {
    return {};
  }
}

async function resolveGeminiProjectIdentifier(projectPath: string): Promise<string> {
  const registry = await readGeminiProjectRegistry();
  const exact = registry[path.resolve(projectPath)];
  if (exact) {
    return exact;
  }

  const normalizedTarget = path.resolve(projectPath);
  for (const [registeredPath, identifier] of Object.entries(registry)) {
    if (path.resolve(registeredPath) === normalizedTarget) {
      return identifier;
    }
  }

  return slugifyGeminiProjectName(projectPath);
}

async function collectFilesRecursive(root: string, includeHidden = false): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (!includeHidden && entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFilesRecursive(fullPath, includeHidden)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function isSubagentPath(filePath: string): boolean {
  return path.normalize(filePath).split(path.sep).includes('subagents');
}

async function isGeminiSubagentSession(filePath: string): Promise<boolean> {
  try {
    const rawContent = await readTextFile(filePath);
    const trimmed = rawContent.trim();
    if (!trimmed) {
      return false;
    }

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed.kind === 'subagent';
  } catch {
    return false;
  }
}

export async function discoverSessionFiles(
  roots: string[],
  includeHidden = false,
): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  const seen = new Set<string>();

  for (const root of roots.map(expandHomePath)) {
    if (!(await pathExists(root))) {
      continue;
    }

    for (const filePath of await collectFilesRecursive(root, includeHidden)) {
      if (seen.has(filePath)) {
        continue;
      }

      if (isSubagentPath(filePath)) {
        continue;
      }

      const detection = await detectSessionFormat(filePath);
      if (!detection) {
        continue;
      }

      if (detection.platform === 'gemini' && (await isGeminiSubagentSession(filePath))) {
        continue;
      }

      const stats = await statFile(filePath);
      files.push({
        path: filePath,
        platform: detection.platform,
        format: detection.format,
        size: stats.size,
        modifiedAt: stats.modifiedAt,
        sessionId: path.basename(filePath).replace(/\.[^.]+$/, ''),
      });
      seen.add(filePath);
    }
  }

  files.sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
  return files;
}

export async function resolveOutputPath(
  sourcePath: string,
  session: Pick<Session, 'id' | 'cwd' | 'createdAt' | 'metadata'>,
  targetPlatform: Platform,
  extension: string,
  outputDir?: string,
): Promise<string> {
  const baseDir = outputDir ? expandHomePath(outputDir) : getDefaultSessionRoots()[targetPlatform];
  const workspacePath = getSessionWorkspacePath(session);

  switch (targetPlatform) {
    case 'claude-code': {
      if (!workspacePath) {
        throw new Error('Claude Code output requires a workspace directory');
      }

      const projectDir = sanitizeClaudeProjectPath(workspacePath);
      const fileName = `${session.id}.${extension}`;
      const outputPath = path.join(baseDir, projectDir, fileName);
      await ensureDir(path.dirname(outputPath));
      return outputPath;
    }
    case 'codex': {
      const { dateDir, fileTimestamp } = formatCodexTimestamp(session.createdAt);
      const fileId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id)
        ? session.id
        : randomUUID();
      const outputPath = path.join(
        baseDir,
        dateDir,
        `rollout-${fileTimestamp}-${fileId}.${extension}`,
      );
      await ensureDir(path.dirname(outputPath));
      return outputPath;
    }
    case 'gemini': {
      if (!workspacePath) {
        throw new Error('Gemini output requires a workspace directory or project hash');
      }
      const projectKey = await resolveGeminiProjectIdentifier(workspacePath);
      if (!projectKey) {
        throw new Error('Gemini output requires a workspace directory or project hash');
      }

      const timestamp = new Date(session.createdAt);
      const safeTimestamp = Number.isNaN(timestamp.getTime())
        ? new Date()
        : timestamp;
      const fileTimestamp = safeTimestamp
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const fileName = `session-${fileTimestamp}-${shortSessionId(session.id)}.${extension}`;
      const outputPath = path.join(baseDir, projectKey, 'chats', fileName);
      await ensureDir(path.dirname(outputPath));
      return outputPath;
    }
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readTextFile(filePath)) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
