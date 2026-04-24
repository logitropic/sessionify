import React from 'react';
import { Box } from 'ink';
import { Session, SessionFile } from '../session/types.js';
import { getAcpMessageCount, getAcpTranscriptTitle } from '../acp/transcript.js';
import { ClippedLine } from './components/clipped-line.js';
import { fitSingleLine } from './utils/text.js';

export type PreviewPanelProps = {
  sessionFile: SessionFile | undefined;
  session: Session | undefined;
  width: number | string;
  height: number | string;
};

function resolveWidth(width: number | string): number {
  return typeof width === 'number' ? width : Number.parseInt(width, 10) || 80;
}

export function buildPreviewSections(
  sessionFile: SessionFile | undefined,
  session: Session | undefined,
): { metadataLines: string[] } {
  if (!sessionFile) {
    return { metadataLines: ['Select a session'] };
  }

  const acpTitle = getAcpTranscriptTitle(session?.acp);
  const updateCount = session?.acp?.updates.length;
  const messageCount = getAcpMessageCount(session?.acp);
  const metadataLines = [
    ...(acpTitle ? [`ACP Title: ${acpTitle}`] : []),
    ...(session?.title && session.title !== acpTitle ? [`Title: ${session.title}`] : []),
    `Path: ${sessionFile.path}`,
    `Platform: ${sessionFile.platform}`,
    `Format: ${sessionFile.format.type}`,
    `ACP Updates: ${updateCount ?? 0}`,
    `ACP Messages: ${messageCount}`,
    `Created: ${session?.createdAt ?? sessionFile.modifiedAt.toISOString()}`,
  ];

  return { metadataLines };
}

export function PreviewPanel({
  sessionFile,
  session,
  width,
  height,
}: PreviewPanelProps) {
  const panelWidth = Math.max(10, resolveWidth(width) - 4);
  const { metadataLines } = buildPreviewSections(sessionFile, session);

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
        <ClippedLine text="Preview" width={panelWidth} bold />
      </Box>

      <ClippedLine text="Metadata" width={panelWidth} bold dimColor />
      {metadataLines.map((line) => (
        <ClippedLine
          key={line}
          text={fitSingleLine(line, panelWidth)}
          width={panelWidth}
        />
      ))}
    </Box>
  );
}
