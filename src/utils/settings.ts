import path from 'node:path';
import os from 'node:os';
import type { Platform } from '../session/types.js';
import { pathExists, readJsonFile, writeJsonFile, ensureDir } from './file-system.js';

export type AppSettings = {
  sessionsDirectory?: string;
  showHiddenFiles: boolean;
  lastPlatform: Platform;
};

export const defaultAppSettings: AppSettings = {
  showHiddenFiles: false,
  lastPlatform: 'gemini',
};

export function getSettingsPath(): string {
  return process.env.SESSION_HISTORY_CONVERTER_SETTINGS ?? path.join(os.homedir(), '.session-history-converter', 'settings.json');
}

export async function loadSettings(): Promise<AppSettings> {
  const settingsPath = getSettingsPath();
  if (!(await pathExists(settingsPath))) {
    return { ...defaultAppSettings };
  }

  try {
    const loaded = await readJsonFile<Partial<AppSettings>>(settingsPath);
    return {
      ...defaultAppSettings,
      ...loaded,
      showHiddenFiles: loaded.showHiddenFiles ?? defaultAppSettings.showHiddenFiles,
      lastPlatform: loaded.lastPlatform ?? defaultAppSettings.lastPlatform,
    };
  } catch {
    return { ...defaultAppSettings };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await ensureDir(path.dirname(settingsPath));
  await writeJsonFile(settingsPath, settings);
}
