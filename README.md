# Sessionify

A CLI tool that converts AI assistant session history between Claude Code, Codex, and Gemini platforms.

## Features

- Automatic format detection (NDJSON, JSONL, JSON)
- Bidirectional conversion between all three platforms
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
# Convert a Claude Code session to Codex
sessionify ./session.ndjson --target codex

# Convert a session and specify output directory
sessionify ./input.gemini.json --target claude-code --output ./output
```

## Development

```bash
npm run dev    # Watch mode
npm run build # Build
npm run test  # Run tests
npm run lint  # Lint
```
