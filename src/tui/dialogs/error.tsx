import React from 'react';
import { ClippedLine } from '../components/clipped-line.js';
import { ModalShell } from '../components/modal-shell.js';

export type ErrorDialogProps = {
  title: string;
  message: string;
  width: number;
};

export function ErrorDialog({ title, message, width }: ErrorDialogProps) {
  const contentWidth = Math.max(10, width - 4);

  return (
    <ModalShell width={width}>
      <ClippedLine text={title} width={contentWidth} bold color="red" />
      <ClippedLine text={message} width={contentWidth} />
      <ClippedLine text="[Enter] OK" width={contentWidth} dimColor />
    </ModalShell>
  );
}
