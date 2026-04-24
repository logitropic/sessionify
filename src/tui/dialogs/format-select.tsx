import React from 'react';
import { ClippedLine } from '../components/clipped-line.js';
import { ModalShell } from '../components/modal-shell.js';
import { Platform } from '../../session/types.js';

export type FormatSelectProps = {
  value: Platform;
  width: number;
};

const options: Array<{ label: string; value: Platform }> = [
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Codex', value: 'codex' },
  { label: 'Gemini CLI', value: 'gemini' },
];

export function FormatSelectDialog({ value, width }: FormatSelectProps) {
  const contentWidth = Math.max(10, width - 4);

  return (
    <ModalShell width={width}>
      <ClippedLine text="Select Target Format" width={contentWidth} bold />
      {options.map((option) => (
        <ClippedLine key={option.value} text={`${option.value === value ? '●' : '○'} ${option.label}`} width={contentWidth} />
      ))}
      <ClippedLine text="[Enter] Convert  [Esc] Cancel" width={contentWidth} dimColor />
    </ModalShell>
  );
}
