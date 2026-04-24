import type { Session, SessionFile } from '../../session/types.js';
import { getAcpTranscriptTitle } from '../../acp/transcript.js';

function normalizeText(value: string | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function getMetadataString(session: Session | undefined, key: string): string {
  const metadata = session?.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }

  const value = metadata[key];
  return typeof value === 'string' ? normalizeText(value) : '';
}

function getBranchLikeLabel(sessionFile: SessionFile, session: Session | undefined): string {
  return (
    getMetadataString(session, 'gitBranch') ||
    getMetadataString(session, 'kind') ||
    getMetadataString(session, 'branch') ||
    getMetadataString(session, 'source') ||
    getMetadataString(session, 'originator') ||
    session?.platform ||
    sessionFile.platform
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(value: Date, now = new Date()): string {
  const deltaMs = value.getTime() - now.getTime();
  const absSeconds = Math.abs(deltaMs) / 1000;
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

  if (absSeconds < 60) {
    return formatter.format(Math.round(deltaMs / 1000), 'second');
  }

  const absMinutes = absSeconds / 60;
  if (absMinutes < 60) {
    return formatter.format(Math.round(deltaMs / 60000), 'minute');
  }

  const absHours = absMinutes / 60;
  if (absHours < 24) {
    return formatter.format(Math.round(deltaMs / 3600000), 'hour');
  }

  const absDays = absHours / 24;
  if (absDays < 7) {
    return formatter.format(Math.round(deltaMs / 86400000), 'day');
  }

  const absWeeks = absDays / 7;
  if (absWeeks < 4) {
    return formatter.format(Math.round(deltaMs / 604800000), 'week');
  }

  const absMonths = absDays / 30;
  if (absMonths < 12) {
    return formatter.format(Math.round(deltaMs / 2592000000), 'month');
  }

  return formatter.format(Math.round(deltaMs / 31536000000), 'year');
}

export function getSessionDisplayTitle(sessionFile: SessionFile, session: Session | undefined): string {
  const candidate =
    getAcpTranscriptTitle(session?.acp) ||
    normalizeText(session?.title);

  return candidate || sessionFile.sessionId;
}

export function getSessionDisplayDetails(
  sessionFile: SessionFile,
  session: Session | undefined,
  now = new Date(),
): string {
  return [
    formatRelativeTime(sessionFile.modifiedAt, now),
    getBranchLikeLabel(sessionFile, session),
    formatFileSize(sessionFile.size),
    sessionFile.path,
  ].join(' · ');
}
