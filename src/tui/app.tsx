import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import { ConfirmDialog } from './dialogs/confirm.js';
import { ErrorDialog } from './dialogs/error.js';
import { ErrorSummaryDialog } from './dialogs/error-summary.js';
import { FormatSelectDialog } from './dialogs/format-select.js';
import { SettingsDialog } from './dialogs/settings.js';
import { ClippedLine } from './components/clipped-line.js';
import { Progress } from './components/progress.js';
import { SessionList } from './session-list.js';
import { StatusBar } from './components/status-bar.js';
import { useTerminalSize } from './hooks/use-terminal-size.js';
import { AppSettings, defaultAppSettings, loadSettings, saveSettings } from '../utils/settings.js';
import { convertSessionFile } from '../session/converter.js';
import { parseSessionFile } from '../session/parser.js';
import { getDefaultSessionRoots, discoverSessionFiles, expandHomePath } from '../utils/file-system.js';
import type { Platform, Session, SessionFile } from '../session/types.js';
import { fitSingleLine } from './utils/text.js';
import { filterSessionsByWorkspace, getWorkspaceRoot } from './utils/workspace-scope.js';
import type { WorkspaceScopedSession } from './utils/workspace-scope.js';

type ViewMode = 'browse' | 'settings' | 'format-select' | 'confirm' | 'progress' | 'error' | 'error-summary';

type PlatformState = {
  selectedIndex: number;
  listScrollOffset: number;
  selectedIds: Set<string>;
};

type ProgressState = {
  label: string;
  value: number;
  total: number;
  cancelled: boolean;
};

const platforms: Array<{ value: Platform; short: string }> = [
  { value: 'claude-code', short: 'Claude' },
  { value: 'codex', short: 'Codex' },
  { value: 'gemini', short: 'Gemini' },
];

const platformLabels: Record<Platform, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
};

const platformTargets: Record<Platform, Platform> = {
  'claude-code': 'gemini',
  codex: 'claude-code',
  gemini: 'claude-code',
};

function createPlatformState(): PlatformState {
  return {
    selectedIndex: 0,
    listScrollOffset: 0,
    selectedIds: new Set<string>(),
  };
}

function clonePlatformState(state: PlatformState): PlatformState {
  return {
    selectedIndex: state.selectedIndex,
    listScrollOffset: state.listScrollOffset,
    selectedIds: new Set(state.selectedIds),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCount(count: number): string {
  return `${count}`;
}

function getRoots(settings: AppSettings): string[] {
  if (settings.sessionsDirectory) {
    return [expandHomePath(settings.sessionsDirectory)];
  }

  return Object.values(getDefaultSessionRoots());
}

function getTargetOutputDir(target: Platform, settings: AppSettings | null): string | undefined {
  if (settings?.sessionsDirectory) {
    return expandHomePath(settings.sessionsDirectory);
  }

  return getDefaultSessionRoots()[target];
}

function getTabLine(activePlatform: Platform, counts: Record<Platform, number>, width: number): string {
  const parts = platforms.map((platform) => {
    const label = `${platform.short} ${formatCount(counts[platform.value])}`;
    return platform.value === activePlatform ? `[${label}]` : label;
  });

  return fitSingleLine(parts.join('  '), width);
}

function getFooterShortcuts(mode: ViewMode): string[] {
  if (mode === 'browse') {
    return ['1/2/3', 'f', 'Ctrl+R', 'h'];
  }

  if (mode === 'settings') {
    return ['h', 'Esc'];
  }

  if (mode === 'format-select') {
    return ['←→', 'Enter', 'Esc'];
  }

  if (mode === 'progress') {
    return ['Esc'];
  }

  return ['Esc'];
}

function normalizeSelectionIndex(state: PlatformState, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return clamp(state.selectedIndex, 0, total - 1);
}

function updateSelectedIndex(state: PlatformState, index: number, total: number, viewportHeight: number): PlatformState {
  const next = clonePlatformState(state);
  next.selectedIndex = normalizeSelectionIndex({ ...next, selectedIndex: index }, total);
  const selected = next.selectedIndex;
  const maxOffset = Math.max(0, total - viewportHeight);
  if (selected < next.listScrollOffset) {
    next.listScrollOffset = selected;
  } else if (selected >= next.listScrollOffset + viewportHeight) {
    next.listScrollOffset = clamp(selected - viewportHeight + 1, 0, maxOffset);
  }
  next.listScrollOffset = clamp(next.listScrollOffset, 0, maxOffset);
  return next;
}

function stepSelection(state: PlatformState, delta: number, total: number, viewportHeight: number): PlatformState {
  return updateSelectedIndex(state, state.selectedIndex + delta, total, viewportHeight);
}

function ensureVisible(state: PlatformState, total: number, viewportHeight: number): PlatformState {
  const next = clonePlatformState(state);
  const selected = normalizeSelectionIndex(next, total);
  const maxOffset = Math.max(0, total - viewportHeight);
  next.selectedIndex = selected;
  next.listScrollOffset = clamp(next.listScrollOffset, 0, maxOffset);
  if (selected < next.listScrollOffset) {
    next.listScrollOffset = selected;
  } else if (selected >= next.listScrollOffset + viewportHeight) {
    next.listScrollOffset = clamp(selected - viewportHeight + 1, 0, maxOffset);
  }
  return next;
}

function buildSessionGroups(sessions: SessionFile[]): Record<Platform, SessionFile[]> {
  return {
    'claude-code': sessions.filter((session) => session.platform === 'claude-code'),
    codex: sessions.filter((session) => session.platform === 'codex'),
    gemini: sessions.filter((session) => session.platform === 'gemini'),
  };
}

function getPlatformLabel(platform: Platform): string {
  return platformLabels[platform];
}

export function App() {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const workspaceRoot = getWorkspaceRoot();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessions, setSessions] = useState<SessionFile[]>([]);
  const [sessionCache, setSessionCache] = useState<Record<string, Session>>({});
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState<Platform>('gemini');
  const [platformState, setPlatformState] = useState<Record<Platform, PlatformState>>({
    'claude-code': createPlatformState(),
    codex: createPlatformState(),
    gemini: createPlatformState(),
  });
  const [mode, setMode] = useState<ViewMode>('browse');
  const [statusMessage, setStatusMessage] = useState('Loading sessions...');
  const [formatTarget, setFormatTarget] = useState<Platform>('claude-code');
  const [busy, setBusy] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({
    label: 'Converting',
    value: 0,
    total: 0,
    cancelled: false,
  });
  const [errorState, setErrorState] = useState<{ title: string; message: string } | null>(null);
  const [errorSummaries, setErrorSummaries] = useState<string[]>([]);
  const [confirmBody, setConfirmBody] = useState('Convert the selected session?');
  const mountedRef = useRef(true);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const bootstrap = async () => {
      try {
        const loaded = await loadSettings();
        if (!mountedRef.current) {
          return;
        }

        setSettings(loaded);
        setActivePlatform(loaded.lastPlatform);
        await reloadSessions(loaded);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to load settings';
        setStatusMessage(message);
        setErrorState({ title: 'Failed to load settings', message });
        setLoading(false);
        setMode('error');
      }
    };

    void bootstrap();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const sessionGroups = useMemo(() => buildSessionGroups(sessions), [sessions]);
  const activeSessions = sessionGroups[activePlatform];
  const activeState = platformState[activePlatform];
  const bodyRows = Math.max(0, terminal.rows - 3);
  const listViewportItems = Math.max(1, Math.floor(Math.max(0, bodyRows - 4) / 2));
  const selectedIndex = normalizeSelectionIndex(activeState, activeSessions.length);
  const selectedSessionFile = activeSessions[selectedIndex];
  const selectedCount = activeState.selectedIds.size;
  const headerStatus = loading ? 'Loading sessions...' : statusMessage;
  const counts: Record<Platform, number> = {
    'claude-code': sessionGroups['claude-code'].length,
    codex: sessionGroups.codex.length,
    gemini: sessionGroups.gemini.length,
  };

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (busy && mode !== 'browse') {
        if (key.escape && mode === 'progress') {
          setProgressState((prev) => ({ ...prev, cancelled: true }));
          setStatusMessage('Cancelling...');
        }
        return;
      }

      if (mode === 'error') {
        if (key.return || key.escape) {
          setMode('browse');
          setErrorState(null);
        }
        return;
      }

      if (mode === 'error-summary') {
        if (key.return || key.escape) {
          setMode('browse');
          setErrorSummaries([]);
        }
        return;
      }

      if (mode === 'confirm') {
        if (key.return) {
          void runConversion(formatTarget);
        } else if (key.escape) {
          setMode('browse');
        }
        return;
      }

      if (mode === 'format-select') {
        if (key.leftArrow || key.upArrow) {
          setFormatTarget((current) => {
            const currentIndex = platforms.findIndex((platform) => platform.value === current);
            const nextIndex = (currentIndex - 1 + platforms.length) % platforms.length;
            return platforms[nextIndex]?.value ?? current;
          });
        } else if (key.rightArrow || key.downArrow) {
          setFormatTarget((current) => {
            const currentIndex = platforms.findIndex((platform) => platform.value === current);
            const nextIndex = (currentIndex + 1) % platforms.length;
            return platforms[nextIndex]?.value ?? current;
          });
        } else if (input === '1') {
          setFormatTarget('claude-code');
        } else if (input === '2') {
          setFormatTarget('codex');
        } else if (input === '3') {
          setFormatTarget('gemini');
        } else if (key.return) {
          setMode('confirm');
          const sources = getActiveSelection();
          setConfirmBody(
            sources.length === 1
              ? `Convert ${sources[0]?.sessionId ?? 'the selected session'} to ${getPlatformLabel(formatTarget)}?`
              : `Convert ${sources.length} selected sessions to ${getPlatformLabel(formatTarget)}?`,
          );
        } else if (key.escape) {
          setMode('browse');
        }
        return;
      }

      if (mode === 'settings') {
        if (key.escape) {
          setMode('browse');
          return;
        }

        if (input.toLowerCase() === 'h' || input === 'H') {
          void toggleHiddenFiles();
        }
        return;
      }

      if (mode === 'progress') {
        if (key.escape) {
          setProgressState((prev) => ({ ...prev, cancelled: true }));
          setStatusMessage('Cancelling...');
        }
        return;
      }

      if (key.escape) {
        setMode('browse');
        return;
      }

      if (key.leftArrow) {
        switchPlatform(-1);
        return;
      }

      if (key.rightArrow) {
        switchPlatform(1);
        return;
      }

      if (input === '1') {
        switchPlatformByValue('claude-code');
        return;
      }

      if (input === '2') {
        switchPlatformByValue('codex');
        return;
      }

      if (input === '3') {
        switchPlatformByValue('gemini');
        return;
      }

      if (input === 'f' || key.return) {
        openFormatSelect();
        return;
      }

      if (input === 'h') {
        void toggleHiddenFiles();
        return;
      }

      if (input === ',') {
        setMode('settings');
        return;
      }

      if (key.ctrl && input === 'r') {
        void reloadSessions(settings ?? defaultAppSettings);
        return;
      }

      if (key.ctrl && input === 'a') {
        toggleSelectAll();
        return;
      }

      if (input === ' ') {
        toggleSelectedSession();
        return;
      }

      if (key.upArrow) {
        moveSelection(-1);
      } else if (key.downArrow) {
        moveSelection(1);
      } else if (key.pageUp) {
        moveSelection(-Math.max(1, listViewportItems));
      } else if (key.pageDown) {
        moveSelection(Math.max(1, listViewportItems));
      } else if (key.home) {
        jumpToSelection(0);
      } else if (key.end) {
        jumpToSelection(Math.max(0, activeSessions.length - 1));
      }
    },
    { isActive: mode !== 'progress' || busy },
  );

  async function reloadSessions(nextSettings: AppSettings) {
    setLoading(true);
    try {
      const discovered = await discoverSessionFiles(getRoots(nextSettings), nextSettings.showHiddenFiles);
      if (!mountedRef.current) {
        return;
      }

      const parsedSessions = await Promise.all(
        discovered.map(async (sessionFile) => {
          try {
            const parsed = await parseSessionFile(sessionFile.path);
            return { sessionFile, session: parsed.session };
          } catch {
            return null;
          }
        }),
      );
      if (!mountedRef.current) {
        return;
      }

      const scopedSessions = filterSessionsByWorkspace(
        parsedSessions.filter((entry): entry is WorkspaceScopedSession => Boolean(entry)),
        workspaceRoot,
      );

      setSessionCache(
        scopedSessions.reduce<Record<string, Session>>((accumulator, entry) => {
          accumulator[entry.sessionFile.path] = entry.session;
          return accumulator;
        }, {}),
      );
      setSessions(scopedSessions.map((entry) => entry.sessionFile));
      setStatusMessage(
        scopedSessions.length > 0
          ? `Loaded ${scopedSessions.length} sessions for current folder`
          : 'No sessions found for current folder',
      );
      setErrorState(null);
      setMode((current) => (current === 'error' ? 'browse' : current));
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to load sessions';
      setStatusMessage(message);
      setErrorState({ title: 'Session load failed', message });
      setMode('error');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  function persistSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  }

  function switchPlatform(delta: number) {
    const currentIndex = platforms.findIndex((platform) => platform.value === activePlatform);
    const nextIndex = (currentIndex + delta + platforms.length) % platforms.length;
    const nextPlatform = platforms[nextIndex]?.value ?? activePlatform;
    switchPlatformByValue(nextPlatform);
  }

  function switchPlatformByValue(nextPlatform: Platform) {
    setActivePlatform(nextPlatform);

    const currentSettings = settings ?? defaultAppSettings;
    if (currentSettings.lastPlatform !== nextPlatform) {
      persistSettings({ ...currentSettings, lastPlatform: nextPlatform });
    }
  }

  function updateActiveState(updater: (state: PlatformState, total: number) => PlatformState) {
    setPlatformState((previous) => {
      const current = previous[activePlatform];
      const next = updater(clonePlatformState(current), activeSessions.length);
      return {
        ...previous,
        [activePlatform]: next,
      };
    });
  }

  function moveSelection(delta: number) {
    updateActiveState((state, total) => stepSelection(state, delta, total, listViewportItems));
  }

  function jumpToSelection(index: number) {
    updateActiveState((state, total) => updateSelectedIndex(state, index, total, listViewportItems));
  }

  function toggleSelectedSession() {
    const sessionFile = selectedSessionFile;
    if (!sessionFile) {
      return;
    }

    updateActiveState((state) => {
      const next = clonePlatformState(state);
      if (next.selectedIds.has(sessionFile.path)) {
        next.selectedIds.delete(sessionFile.path);
      } else {
        next.selectedIds.add(sessionFile.path);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    updateActiveState((state) => {
      const next = clonePlatformState(state);
      const shouldSelectAll = next.selectedIds.size !== activeSessions.length && activeSessions.length > 0;
      next.selectedIds = shouldSelectAll ? new Set(activeSessions.map((session) => session.path)) : new Set<string>();
      return next;
    });
  }

  function getActiveSelection(): SessionFile[] {
    const selected = activeState.selectedIds.size > 0 ? activeSessions.filter((session) => activeState.selectedIds.has(session.path)) : [];
    if (selected.length > 0) {
      return selected;
    }

    return selectedSessionFile ? [selectedSessionFile] : [];
  }

  async function toggleHiddenFiles() {
    const nextSettings = {
      ...(settings ?? defaultAppSettings),
      showHiddenFiles: !(settings?.showHiddenFiles ?? defaultAppSettings.showHiddenFiles),
    };

    persistSettings(nextSettings);
    await reloadSessions(nextSettings);
    setStatusMessage(nextSettings.showHiddenFiles ? 'Hidden files shown' : 'Hidden files hidden');
  }

  function openFormatSelect() {
    if (!selectedSessionFile) {
      setStatusMessage('No session selected');
      return;
    }

    setFormatTarget(platformTargets[selectedSessionFile.platform] ?? 'gemini');
    setMode('format-select');
  }

  async function runConversion(targetPlatform: Platform) {
    const sources = getActiveSelection();
    if (sources.length === 0) {
      setStatusMessage('No sessions selected');
      setMode('browse');
      return;
    }

    const nextSettings = settings ?? defaultAppSettings;
    const outputDir = getTargetOutputDir(targetPlatform, nextSettings);
    setMode('progress');
    setBusy(true);
    cancelRequestedRef.current = false;
    setProgressState({
      label: `Converting to ${getPlatformLabel(targetPlatform)}`,
      value: 0,
      total: sources.length,
      cancelled: false,
    });

    const failures: string[] = [];
    let completed = 0;

    for (const source of sources) {
      if (cancelRequestedRef.current) {
        break;
      }

      try {
        await convertSessionFile({
          sourcePath: source.path,
          targetPlatform,
          ...(outputDir ? { outputDir } : {}),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${source.sessionId}: ${message}`);
      }

      completed += 1;
      setProgressState((current) => ({
        ...current,
        value: completed,
      }));
    }

    setBusy(false);
    await reloadSessions(nextSettings);

    if (cancelRequestedRef.current) {
      setStatusMessage('Conversion cancelled');
      setMode('browse');
      return;
    }

    if (failures.length > 0) {
      setErrorSummaries(failures);
      setMode('error-summary');
      setStatusMessage(`Completed with ${failures.length} failure(s)`);
      return;
    }

    setStatusMessage(`Converted ${sources.length} session(s) to ${getPlatformLabel(targetPlatform)}`);
    setMode('browse');
  }

  function renderBrowseBody() {
    const listState = ensureVisible(clonePlatformState(activeState), activeSessions.length, listViewportItems);
    const normalizedSelectedIndex = normalizeSelectionIndex(listState, activeSessions.length);

    return (
      <SessionList
        sessions={activeSessions}
        sessionCache={sessionCache}
        selectedIndex={normalizedSelectedIndex}
        selectedIds={listState.selectedIds}
        showHiddenFiles={settings?.showHiddenFiles ?? defaultAppSettings.showHiddenFiles}
        emptyMessage="No sessions found for current folder"
        scrollOffset={listState.listScrollOffset}
        viewportHeight={bodyRows}
        width={terminal.columns}
        height={bodyRows}
      />
    );
  }

  function renderModalBody() {
    const centeredWidth = Math.min(Math.max(20, terminal.columns - 4), Math.max(20, terminal.columns), 72);

    return (
      <Box flexDirection="column" width={terminal.columns} height={bodyRows} justifyContent="center" alignItems="center" overflow="hidden">
        <Box width={centeredWidth} justifyContent="center">
          {mode === 'settings' && <SettingsDialog settings={settings ?? defaultAppSettings} width={centeredWidth} />}
          {mode === 'format-select' && <FormatSelectDialog value={formatTarget} width={centeredWidth} />}
          {mode === 'confirm' && <ConfirmDialog title={`Convert to ${getPlatformLabel(formatTarget)}`} body={confirmBody} width={centeredWidth} />}
          {mode === 'progress' && <Progress label={progressState.label} value={progressState.value} total={progressState.total} cancelled={progressState.cancelled} />}
          {mode === 'error' && errorState ? <ErrorDialog title={errorState.title} message={errorState.message} width={centeredWidth} /> : null}
          {mode === 'error-summary' ? <ErrorSummaryDialog title="Conversion finished with errors" failures={errorSummaries} width={centeredWidth} /> : null}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={terminal.columns} height={terminal.rows} overflow="hidden">
      <Box flexDirection="column" height={2} overflow="hidden">
        <Box flexDirection="row" justifyContent="space-between">
          <ClippedLine text="Session History Converter" width={Math.max(0, terminal.columns - 28)} bold />
          <ClippedLine text={headerStatus} width={28} color="gray" />
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <ClippedLine text={getTabLine(activePlatform, counts, Math.max(0, terminal.columns - 20))} width={Math.max(0, terminal.columns - 20)} />
          <ClippedLine text="1/2/3  f  Ctrl+R  h" width={20} color="gray" />
        </Box>
      </Box>

      <Box flexDirection="column" height={bodyRows} overflow="hidden">
        {mode === 'browse' ? renderBrowseBody() : renderModalBody()}
      </Box>

      <StatusBar
        message={`${getPlatformLabel(activePlatform)} · ${activeSessions.length} · list`}
        selectedCount={selectedCount}
        shortcuts={getFooterShortcuts(mode)}
        width={terminal.columns}
      />
    </Box>
  );
}
