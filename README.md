# Sessionify

A terminal UI for browsing and converting AI assistant session history between Claude Code, Codex, and Gemini platforms.

## Features

- Browse sessions from all platforms in a unified interface
- Automatic format detection (NDJSON, JSONL, JSON)
- Convert sessions between Claude Code, Codex, and Gemini
- Output verification and validation
- Preserves message structure, tool calls, and metadata

## Supported Formats

| Platform | Format | Extension |
|----------|--------|-----------|
| Claude Code | NDJSON | `.ndjson` |
| Codex | JSONL | `.jsonl` |
| Gemini | JSON | `.json` |

## Installation

```bash
npm install -g @logitropic/sessionify
```

## Usage

```bash
sessionify
```

### Keybindings

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Switch between Claude Code / Codex / Gemini |
| `f` / `Enter` | Convert selected session |
| `Space` | Select/deselect session |
| `Ctrl+A` | Select all sessions |
| `Ctrl+R` | Reload sessions |
| `h` | Toggle hidden files |
| `,` | Open settings |
| `Esc` | Go back / Cancel |
| `Ctrl+C` | Quit |

## Development

```bash
npm install
npm run build
npm run start   # Run the app
npm run dev    # Watch mode
npm run test   # Run tests
npm run lint   # Lint
```
