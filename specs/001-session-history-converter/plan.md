# Implementation Plan: Session History Converter

**Branch**: `001-session-history-converter` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-session-history-converter/spec.md`

## Summary

A TUI application to convert session history between Claude Code, Codex, and Gemini CLI formats. Users can browse sessions in an interactive terminal UI, select source sessions, choose target format, and convert with preserved message integrity. Supports bidirectional conversion across all three platforms.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React (for TUI components via ink), uuid, zod (validation)
**Storage**: Local filesystem (session files in each platform's native location)
**Testing**: Vitest (unit), Playwright (TUI interaction tests)
**Target Platform**: macOS/Linux (terminal-based)
**Project Type**: TUI (terminal user interface) desktop tool
**Performance Goals**: <2s for loading 100 sessions, <10s for converting 100-message session
**Constraints**: Offline-only operation, local file access only
**Scale/Scope**: Single user, local session files (typically <50MB per session)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Code Quality**: Implementation MUST be modular, self-contained, documented
- **Testing**: Unit tests REQUIRED for all public interfaces; integration tests for contracts
- **UX Consistency**: Interaction patterns and output formats MUST be consistent
- **Performance**: Latency/resource bounds defined in plan; benchmarks for critical paths
- **Observability**: Structured logging, correlation IDs, metrics for key operations

## Project Structure

### Documentation (this feature)

```text
specs/001-session-history-converter/
├── plan.md              # This file
├── research.md          # Phase 0 output (session format analysis)
├── data-model.md        # Phase 1 output (entity definitions)
├── quickstart.md        # Phase 1 output (usage guide)
├── contracts/
│   └── tui-contracts.md # Phase 1 output (UI contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
session-history-converter/
├── src/
│   ├── index.ts              # Entry point
│   ├── session/
│   │   ├── types.ts          # Core types (Session, Message, ToolCall)
│   │   ├── detector.ts       # Format auto-detection
│   │   ├── parser.ts         # Platform → CommonSession
│   │   ├── serializer.ts     # CommonSession → Platform
│   │   └── converter.ts      # Conversion orchestration
│   ├── platform/
│   │   ├── claude-code-parser.ts      # Claude Code NDJSON parser
│   │   ├── claude-code-serializer.ts  # Claude Code NDJSON serializer
│   │   ├── codex-parser.ts             # Codex JSONL parser
│   │   ├── codex-serializer.ts        # Codex JSONL serializer
│   │   ├── gemini-parser.ts           # Gemini JSON parser
│   │   └── gemini-serializer.ts      # Gemini JSON serializer
│   ├── tui/
│   │   ├── app.tsx           # Main TUI app (ink component)
│   │   ├── session-list.tsx  # Session list sidebar
│   │   ├── preview-panel.tsx # Session preview
│   │   ├── dialogs/
│   │   │   ├── format-select.tsx
│   │   │   ├── confirm.tsx
│   │   │   ├── error.tsx
│   │   │   └── settings.tsx
│   │   └── components/
│   │       ├── progress.tsx
│   │       └── status-bar.tsx
│   └── utils/
│       ├── file-system.ts    # File operations
│       └── logger.ts         # Structured logging
├── tests/
│   ├── unit/
│   │   ├── parser.test.ts
│   │   ├── serializer.test.ts
│   │   └── converter.test.ts
│   └── integration/
│       └── tui.test.ts
├── package.json
└── tsconfig.json
```

**Structure Decision**: Single project with functional separation: `session/` (core logic), `platform/` (format-specific), `tui/` (UI layer), `utils/` (shared utilities).

## Complexity Tracking

> No constitution violations to justify.

## Research Findings

Session formats differ significantly:
- **Claude Code**: NDJSON with LogOption header and Entry-based message types
- **Codex**: JSONL with SessionMeta first line and RolloutItem enum
- **Gemini CLI**: Regular JSON with ConversationRecord and MessageRecord

**Common format** defined to enable bidirectional conversion:
- Session with `id`, `platform`, `createdAt`, `updatedAt`, `title`, `messages[]`
- Message with `id`, `role` (user/assistant/system), `content`, `timestamp`, `attachments`, `toolCalls`

## Next Steps

Run `/speckit.tasks` to generate implementation task list.
