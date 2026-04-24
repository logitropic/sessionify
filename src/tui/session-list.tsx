import React from 'react';
import { Box } from 'ink';
import { Session, SessionFile } from '../session/types.js';
import { ClippedLine } from './components/clipped-line.js';
import { clamp, fitSingleLine } from './utils/text.js';
import { getSessionDisplayDetails, getSessionDisplayTitle } from './utils/session-display.js';

export type SessionListProps = {
  sessions: SessionFile[];
  sessionCache: Record<string, Session | undefined>;
  selectedIndex: number;
  selectedIds: Set<string>;
  showHiddenFiles: boolean;
  emptyMessage?: string;
  scrollOffset: number;
  viewportHeight: number;
  width: number | string;
  height: number | string;
};

function resolveWidth(width: number | string): number {
  return typeof width === 'number' ? width : Number.parseInt(width, 10) || 80;
}

export function SessionList({
  sessions,
  sessionCache,
  selectedIndex,
  selectedIds,
  showHiddenFiles,
  emptyMessage = 'No sessions found',
  scrollOffset,
  viewportHeight,
  width,
  height,
}: SessionListProps) {
  const panelWidth = Math.max(10, resolveWidth(width) - 4);
  const contentHeight = Math.max(0, viewportHeight - 4);
  const visibleCount = Math.max(0, Math.floor(contentHeight / 2));
  const maxOffset = visibleCount > 0 ? Math.max(0, sessions.length - visibleCount) : 0;
  const offset = clamp(scrollOffset, 0, maxOffset);
  const visibleSessions = sessions.slice(offset, offset + visibleCount);
  const start = visibleCount === 0 || sessions.length === 0 ? 0 : offset + 1;
  const end = visibleCount === 0 || sessions.length === 0 ? 0 : Math.min(sessions.length, offset + visibleSessions.length);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      overflow="hidden"
    >
      <Box flexDirection="row" justifyContent="space-between">
        <ClippedLine text="Sessions" width={Math.max(0, panelWidth - 10)} bold />
        <ClippedLine text={`${start}-${end} / ${sessions.length}`} width={10} dimColor />
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <ClippedLine text={`Selected: ${selectedIds.size}`} width={Math.max(0, panelWidth - 12)} dimColor />
        <ClippedLine text={showHiddenFiles ? 'Hidden: on' : 'Hidden: off'} width={12} dimColor />
      </Box>
      <ClippedLine text="────────────────────────────────" width={panelWidth} dimColor />

      {visibleSessions.length === 0 ? (
        <ClippedLine
          text={sessions.length === 0 ? emptyMessage : 'Panel too small'}
          width={panelWidth}
          color="yellow"
        />
      ) : (
        visibleSessions.map((session, index) => {
          const absoluteIndex = offset + index;
          const isActive = absoluteIndex === selectedIndex;
          const isMarked = selectedIds.has(session.path);
          const parsedSession = sessionCache[session.path];
          const title = fitSingleLine(getSessionDisplayTitle(session, parsedSession), panelWidth);
          const details = fitSingleLine(getSessionDisplayDetails(session, parsedSession), panelWidth);
          const selectedProps = isActive ? { color: 'black', backgroundColor: 'cyan' } : {};
          const checkbox = isMarked ? '[x]' : '[ ]';

          return (
            <Box key={session.path} flexDirection="column">
              <ClippedLine
                text={`${checkbox} ${title}`}
                width={panelWidth}
                bold
                {...selectedProps}
              />
              <ClippedLine
                text={details}
                width={panelWidth}
                dimColor={!isActive}
                {...selectedProps}
              />
            </Box>
          );
        })
      )}
    </Box>
  );
}
