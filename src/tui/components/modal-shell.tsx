import React from 'react';
import { Box } from 'ink';

export type ModalShellProps = {
  width: number;
  children: React.ReactNode;
};

export function ModalShell({ width, children }: ModalShellProps) {
  return (
    <Box flexDirection="column" width={width} borderStyle="round" paddingX={1} paddingY={1} overflow="hidden">
      {children}
    </Box>
  );
}
