# Quickstart: Session History Converter

## Installation

```bash
# Clone and build
git clone <repository>
cd session-history-converter
npm install
npm run build
```

## Usage

### Launch TUI

```bash
npm start
# or
node dist/index.js
```

### First Run

1. Launch the TUI
2. Configure sessions directory via `Settings` (Ctrl+,)
3. Browse available sessions in the left panel
4. Select a session to preview
5. Choose target format and click Convert

### Common Operations

| Operation | Action |
|-----------|--------|
| Browse sessions | Arrow keys to navigate |
| Select session | Enter or click |
| Multi-select | Space to toggle |
| Convert session | Select + Convert button |
| Refresh list | Ctrl+R |
| Settings | Ctrl+, |

### Keyboard Shortcuts

- `↑` / `↓` - Navigate list
- `Enter` - Select
- `Space` - Multi-select
- `f` - Open target format selector
- `Ctrl+A` - Select all visible sessions
- `Ctrl+R` - Refresh session list
- `Esc` - Cancel / Close
- `Ctrl+,` - Open settings
- `Ctrl+C` - Exit
- `h` - Toggle hidden files from settings

### Output

Converted sessions are saved to:
- Claude Code: `~/.claude/projects/<project>/`
- Codex: `~/.codex/sessions/`
- Gemini: `~/.gemini/tmp/<project>/chats/`
