import React from 'react';
import { Box, Text } from 'ink';
import { fitSingleLine } from '../utils/text.js';

export type ClippedLineProps = {
  text: string;
  width: number;
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
  backgroundColor?: string;
};

export function ClippedLine({ text, width, color, dimColor, bold, backgroundColor }: ClippedLineProps) {
  const textProps: Record<string, unknown> = {};
  if (color) {
    textProps.color = color;
  }
  if (backgroundColor) {
    textProps.backgroundColor = backgroundColor;
  }
  if (bold) {
    textProps.bold = true;
  }
  if (dimColor) {
    textProps.dimColor = true;
  }

  return (
    <Box width={width} overflow="hidden">
      <Text {...textProps}>
        {fitSingleLine(text, width)}
      </Text>
    </Box>
  );
}
