import path from 'node:path';
import { Session } from '../session/types.js';
import { pathExists } from '../utils/file-system.js';

const DEFAULT_MODEL_PROVIDER = 'openai';
const ACCEPTED_SOURCES = new Set(['cli', 'vscode', 'exec', 'mcp', 'unknown']);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCodexSource(value: unknown): string {
  if (typeof value !== 'string') {
    return 'cli';
  }

  const normalized = value.trim().toLowerCase();
  return ACCEPTED_SOURCES.has(normalized) ? normalized : 'cli';
}

function resolveModelProvider(): string {
  const envProvider = process.env.CODEX_MODEL_PROVIDER_ID ?? process.env.CODEX_MODEL_PROVIDER;
  if (typeof envProvider === 'string' && envProvider.trim()) {
    return envProvider.trim();
  }

  return DEFAULT_MODEL_PROVIDER;
}

function getFirstUserMessage(session: Pick<Session, 'messages' | 'title'>): string {
  for (const message of session.messages) {
    if (message.role !== 'user') {
      continue;
    }

    const content = normalizeText(message.content);
    if (content) {
      return content;
    }
  }

  const fallbackTitle = normalizeText(session.title);
  return fallbackTitle || 'Converted session';
}

function getCodexHomeFromRolloutPath(outputPath: string): string | undefined {
  let current = path.dirname(path.resolve(outputPath));

  while (true) {
    if (path.basename(current) === 'sessions') {
      return path.dirname(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function toUnixSeconds(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
}

function readMetadataString(metadata: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function toNullableString(value: string | undefined): string | null {
  return value ?? null;
}

export async function syncCodexSessionIndex(session: Session, outputPath: string): Promise<void> {
  const codexHome = getCodexHomeFromRolloutPath(outputPath);
  if (!codexHome) {
    return;
  }

  const stateDbPath = path.join(codexHome, 'state_5.sqlite');
  if (!(await pathExists(stateDbPath))) {
    return;
  }

  const sqlite = (await import('node:sqlite')) as {
    DatabaseSync: new (path: string) => {
      prepare(sql: string): {
        run(...params: unknown[]): unknown;
      };
      close(): void;
    };
  };

  const database = new sqlite.DatabaseSync(stateDbPath);
  try {
    const metadata = session.metadata as Record<string, unknown> | undefined;
    const createdAt = toUnixSeconds(session.createdAt);
    const updatedAt = toUnixSeconds(session.updatedAt);
    const firstUserMessage = getFirstUserMessage(session);
    const title = normalizeText(session.title) || firstUserMessage;
    const source = normalizeCodexSource(readMetadataString(metadata, 'source'));
    const modelProvider = resolveModelProvider();
    const sandboxPolicy =
      readMetadataString(metadata, 'sandbox_policy', 'sandboxPolicy') ??
      (session.cwd
        ? JSON.stringify({
            type: 'workspace-write',
            writable_roots: [session.cwd],
            network_access: false,
            exclude_tmpdir_env_var: false,
            exclude_slash_tmp: false,
          })
        : JSON.stringify({
            type: 'workspace-write',
            writable_roots: [],
            network_access: false,
            exclude_tmpdir_env_var: false,
            exclude_slash_tmp: false,
          }));
    const approvalMode = readMetadataString(metadata, 'approval_mode', 'approvalMode') ?? 'on-request';
    const cliVersion = readMetadataString(metadata, 'cli_version', 'cliVersion') ?? '';
    const memoryMode = readMetadataString(metadata, 'memory_mode', 'memoryMode') ?? 'enabled';
    const agentNickname = readMetadataString(metadata, 'agent_nickname', 'agentNickname');
    const agentRole = readMetadataString(metadata, 'agent_role', 'agentRole');
    const agentPath = readMetadataString(metadata, 'agent_path', 'agentPath');
    const model = readMetadataString(metadata, 'model');
    const reasoningEffort = readMetadataString(metadata, 'reasoning_effort', 'reasoningEffort');
    const gitSha = readMetadataString(metadata, 'git_sha', 'gitSha');
    const gitBranch = readMetadataString(metadata, 'git_branch', 'gitBranch');
    const gitOriginUrl = readMetadataString(metadata, 'git_origin_url', 'gitOriginUrl');

    database
      .prepare(
        `
INSERT INTO threads (
  id,
  rollout_path,
  created_at,
  updated_at,
  source,
  agent_nickname,
  agent_role,
  agent_path,
  model_provider,
  model,
  reasoning_effort,
  cwd,
  cli_version,
  title,
  sandbox_policy,
  approval_mode,
  tokens_used,
  first_user_message,
  archived,
  archived_at,
  git_sha,
  git_branch,
  git_origin_url,
  memory_mode
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  rollout_path = excluded.rollout_path,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  source = excluded.source,
  agent_nickname = excluded.agent_nickname,
  agent_role = excluded.agent_role,
  agent_path = excluded.agent_path,
  model_provider = excluded.model_provider,
  model = excluded.model,
  reasoning_effort = excluded.reasoning_effort,
  cwd = excluded.cwd,
  cli_version = excluded.cli_version,
  title = excluded.title,
  sandbox_policy = excluded.sandbox_policy,
  approval_mode = excluded.approval_mode,
  tokens_used = excluded.tokens_used,
  first_user_message = excluded.first_user_message,
  archived = excluded.archived,
  archived_at = excluded.archived_at,
  git_sha = excluded.git_sha,
  git_branch = excluded.git_branch,
  git_origin_url = excluded.git_origin_url,
  memory_mode = excluded.memory_mode
        `,
      )
      .run(
        session.id,
        outputPath,
        createdAt,
        updatedAt,
        source,
        toNullableString(agentNickname),
        toNullableString(agentRole),
        toNullableString(agentPath),
        modelProvider,
        toNullableString(model),
        toNullableString(reasoningEffort),
        session.cwd ?? '',
        cliVersion,
        title,
        sandboxPolicy,
        approvalMode,
        0,
        firstUserMessage,
        0,
        null,
        toNullableString(gitSha),
        toNullableString(gitBranch),
        toNullableString(gitOriginUrl),
        memoryMode,
      );
  } finally {
    database.close();
  }
}
