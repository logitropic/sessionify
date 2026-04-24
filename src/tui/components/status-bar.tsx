import React from 'react';
import { Box } from 'ink';
import { ClippedLine } from './clipped-line.js';

export type StatusBarProps = {
  message: string;
  selectedCount: number;
  shortcuts?: string[];
  width?: number;
};

export function StatusBar({ message, selectedCount, shortcuts = [], width = 80 }: StatusBarProps) {
  const leftText = selectedCount > 0 ? `${message}  • Selected: ${selectedCount}` : message;
  const rightText = shortcuts.join('  ·  ');
  const leftWidth = Math.max(0, Math.floor(width * 0.6));
  const rightWidth = Math.max(0, width - leftWidth);

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      <ClippedLine text={leftText} width={leftWidth} />
      <ClippedLine text={rightText} width={rightWidth} color="gray" />
    </Box>
  );
}
