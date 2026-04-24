import React from 'react';
import { ClippedLine } from '../components/clipped-line.js';
import { ModalShell } from '../components/modal-shell.js';

export type ConfirmDialogProps = {
  title: string;
  body: string;
  width: number;
};

export function ConfirmDialog({ title, body, width }: ConfirmDialogProps) {
  const contentWidth = Math.max(10, width - 4);

  return (
    <ModalShell width={width}>
      <ClippedLine text={title} width={contentWidth} bold />
      <ClippedLine text={body} width={contentWidth} />
      <ClippedLine text="[Enter] Confirm  [Esc] Cancel" width={contentWidth} dimColor />
    </ModalShell>
  );
}
