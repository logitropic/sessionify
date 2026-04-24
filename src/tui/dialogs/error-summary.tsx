import React from 'react';
import { ClippedLine } from '../components/clipped-line.js';
import { ModalShell } from '../components/modal-shell.js';

export type ErrorSummaryDialogProps = {
  title: string;
  failures: string[];
  width: number;
};

export function ErrorSummaryDialog({ title, failures, width }: ErrorSummaryDialogProps) {
  const contentWidth = Math.max(10, width - 4);

  return (
    <ModalShell width={width}>
      <ClippedLine text={title} width={contentWidth} bold color="red" />
      {failures.length === 0 ? (
        <ClippedLine text="No failures reported." width={contentWidth} />
      ) : (
        failures.map((failure) => <ClippedLine key={failure} text={`• ${failure}`} width={contentWidth} />)
      )}
      <ClippedLine text="[Enter] OK" width={contentWidth} dimColor />
    </ModalShell>
  );
}
