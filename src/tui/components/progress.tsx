import React from 'react';
import { Box } from 'ink';
import { ClippedLine } from './clipped-line.js';

export type ProgressProps = {
  label: string;
  value: number;
  total: number;
  cancelled?: boolean;
};

export function Progress({ label, value, total, cancelled }: ProgressProps) {
  const ratio = total <= 0 ? 0 : Math.min(1, Math.max(0, value / total));
  const width = 24;
  const filled = Math.round(width * ratio);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={1}>
      <ClippedLine text={label} width={30} />
      <ClippedLine text={`${bar} ${Math.round(ratio * 100)}%`} width={30} color={cancelled ? 'red' : 'green'} />
    </Box>
  );
}
