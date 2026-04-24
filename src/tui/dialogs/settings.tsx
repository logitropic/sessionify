import React from 'react';
import { ClippedLine } from '../components/clipped-line.js';
import { ModalShell } from '../components/modal-shell.js';
import { AppSettings } from '../../utils/settings.js';

export type SettingsDialogProps = {
  settings: AppSettings;
  width: number;
};

export function SettingsDialog({ settings, width }: SettingsDialogProps) {
  const contentWidth = Math.max(10, width - 4);

  return (
    <ModalShell width={width}>
      <ClippedLine text="Settings" width={contentWidth} bold />
      <ClippedLine text={`Sessions directory: ${settings.sessionsDirectory ?? '(default roots)'}`} width={contentWidth} />
      <ClippedLine text={`Show hidden files: ${settings.showHiddenFiles ? 'yes' : 'no'}`} width={contentWidth} />
      <ClippedLine text={`Last platform: ${settings.lastPlatform}`} width={contentWidth} />
      <ClippedLine text="[Ctrl+,] toggle from app settings" width={contentWidth} dimColor />
    </ModalShell>
  );
}
