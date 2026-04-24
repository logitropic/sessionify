# Contracts: Session History Converter

## TUI Component Interface

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Header: App Title │ Current Directory │ Settings [gear] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐│
│  │ Session List    │  │ Preview Panel                 ││
│  │ (left sidebar)  │  │ (selected session details)    ││
│  │                 │  │                              ││
│  │ - session-1     │  │ Messages: 50                 ││
│  │ - session-2     │  │ Platform: Claude Code        ││
│  │ - session-3     │  │ Created: 2026-04-20         ││
│  │                 │  │                              ││
│  │ [navigate]     │  │ First message preview...     ││
│  │                 │  │                              ││
│  └─────────────────┘  └──────────────────────────────┘│
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Action Bar: [Convert ▼] [Refresh] [Select All]          │
│              │ Claude Code │ Gemini │ Codex              │
└─────────────────────────────────────────────────────────┘
```

### Key Dialogs

#### Format Selection Dialog

```
┌─────────────────────────────────┐
│ Select Target Format            │
├─────────────────────────────────┤
│ ○ Claude Code                   │
│ ○ Codex                        │
│ ○ Gemini CLI                   │
├─────────────────────────────────┤
│        [Cancel] [Convert]      │
└─────────────────────────────────┘
```

#### Confirmation Dialog

```
┌─────────────────────────────────┐
│ Confirm Conversion              │
├─────────────────────────────────┤
│ Convert "session-xxx" to        │
│ Claude Code format?              │
│                                │
│ 50 messages will be converted.  │
├─────────────────────────────────┤
│        [Cancel] [Confirm]      │
└─────────────────────────────────┘
```

#### Error Dialog

```
┌─────────────────────────────────┐
│ Conversion Error               │
├─────────────────────────────────┤
│ × File is corrupted or invalid │
│                                │
│ Details: Unexpected token at   │
│ line 42                        │
├─────────────────────────────────┤
│              [OK]              │
└─────────────────────────────────┘
```

#### Settings Dialog

```
┌─────────────────────────────────┐
│ Settings                        │
├─────────────────────────────────┤
│ Sessions Directory:             │
│ [/path/to/sessions    ] [Browse]│
│                                │
│ [ ] Auto-refresh on changes    │
│ [ ] Show hidden files          │
├─────────────────────────────────┤
│        [Cancel] [Save]         │
└─────────────────────────────────┘
```

---

## Component Commands

| Component | Command | Description |
|-----------|---------|-------------|
| `SessionList` | `select(index)` | Select session at index |
| `SessionList` | `multiSelect(index)` | Toggle selection |
| `SessionList` | `selectAll()` | Select all visible |
| `SessionList` | `refresh()` | Reload session list |
| `PreviewPanel` | `setSession(id)` | Show session details |
| `FormatMenu` | `open()` | Open format dropdown |
| `FormatMenu` | `select(format)` | Select target format |
| `ConversionDialog` | `confirm()` | Execute conversion |
| `ConversionDialog` | `cancel()` | Abort conversion |
| `ProgressIndicator` | `start()` | Show progress bar |
| `ProgressIndicator` | `update(progress)` | Update percentage |
| `ProgressIndicator` | `complete()` | Show success |
| `ProgressIndicator` | `error(message)` | Show error state |

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate session list |
| `Enter` | Select / Confirm |
| `Space` | Multi-select toggle |
| `Esc` | Close dialog / Cancel |
| `Tab` | Switch focus area |
| `Ctrl+A` | Select all sessions |
| `Ctrl+R` | Refresh list |
| `Ctrl+,` | Open settings |

---

## Progress & Feedback

### Conversion Progress

```
Converting session-xxx...
████████████░░░░░░░░░░░ 60%
```

### Status Messages

| State | Message |
|-------|---------|
| Loading | "Loading sessions..." |
| Empty | "No sessions found in directory" |
| Converting | "Converting {n} sessions..." |
| Success | "✓ Converted {n} sessions" |
| Partial | "⚠ {n} succeeded, {m} failed" |
| Error | "✗ Conversion failed: {reason}" |
