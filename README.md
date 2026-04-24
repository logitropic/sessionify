# Sessionify

[![npm version](https://img.shields.io/npm/v/@logitropic/sessionify?style=for-the-badge)](https://www.npmjs.com/package/@logitropic/sessionify)
[![license](https://img.shields.io/npm/l/@logitropic/sessionify?style=for-the-badge)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ink](https://img.shields.io/badge/TUI-Ink-000000?style=for-the-badge)](https://github.com/vadimdemedes/ink)

Terminal UI for browsing, detecting, and converting AI assistant session history across Claude Code, Codex, and Gemini.

## At a glance

Sessionify gives you one workspace for three session formats:

- Inspect sessions from multiple platforms in a single TUI
- Detect session format automatically
- Convert history while preserving structure, tool calls, and metadata
- Validate output before writing it back

## Why this exists

Session history is usually trapped in platform-specific formats. Sessionify makes it easier to:

- move sessions between tools
- inspect what was captured
- verify that the converted output still matches the source structure

## Supported formats

| Platform | Format | Extension |
|---|---|---|
| Claude Code | NDJSON | `.ndjson` |
| Codex | JSONL | `.jsonl` |
| Gemini | JSON | `.json` |

## Install

```bash
npm install -g @logitropic/sessionify
```

## Quick start

```bash
sessionify
```

Open the TUI, browse sessions, then use the platform switcher and conversion keys to work across formats.

## Keybindings

| Key | Action |
|---|---|
| `1` / `2` / `3` | Switch between Claude Code / Codex / Gemini |
| `f` / `Enter` | Convert selected session |
| `Space` | Select or deselect a session |
| `Ctrl+A` | Select all sessions |
| `Ctrl+R` | Reload sessions |
| `h` | Toggle hidden files |
| `,` | Open settings |
| `Esc` | Go back or cancel |
| `Ctrl+C` | Quit |

## Development

```bash
npm install
npm run build
npm run start
npm run dev
npm run test
npm run lint
```

## Notes

- `npm run start` runs the built app from `dist/`
- `npm run dev` watches TypeScript changes
- `npm run test` runs the unit test suite
