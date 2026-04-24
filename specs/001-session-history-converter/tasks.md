# Tasks: Session History Converter

**Input**: Design documents from `/specs/001-session-history-converter/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project directory structure `session-history-converter/` with `src/`, `tests/`, `scripts/`
- [X] T002 [P] Initialize npm project with `npm init -y` in `session-history-converter/`
- [X] T003 [P] Install TypeScript 5.x, @types/node, typescript as dev dependencies
- [X] T004 [P] Install ink, react, @types/react for TUI framework
- [X] T005 [P] Install uuid, @types/uuid for ID generation
- [X] T006 [P] Install zod for runtime validation
- [X] T007 [P] Install vitest and @vitest/ui for unit testing
- [X] T008 [P] Install playwright for TUI integration testing
- [X] T009 Create `tsconfig.json` with strict mode enabled
- [X] T010 Configure linting and formatting (ESLint + Prettier)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core session parsing and conversion logic used by all user stories

**CRITICAL**: No user story work begins until this phase is complete

### Core Types and Session Model

- [X] T011 [P] Create `session-history-converter/src/session/types.ts` with Platform, Session, Message, ToolCall interfaces
- [X] T012 [P] Create `session-history-converter/src/session/detector.ts` for format auto-detection based on file content
- [X] T013 [P] Create `session-history-converter/src/session/parser.ts` base interface and error types

### Platform Parsers (Source → CommonSession)

- [X] T014 [P] Create `session-history-converter/src/platform/claude-code-parser.ts` - NDJSON parser for Claude Code sessions
- [X] T015 [P] Create `session-history-converter/src/platform/codex-parser.ts` - JSONL parser for Codex sessions
- [X] T016 [P] Create `session-history-converter/src/platform/gemini-parser.ts` - JSON parser for Gemini CLI sessions
- [X] T017 [P] Create `session-history-converter/src/session/parser.ts` with format detection routing to platform parsers

### Platform Serializers (CommonSession → Target)

- [X] T018 [P] Create `session-history-converter/src/platform/claude-code-serializer.ts` - Convert to Claude Code NDJSON
- [X] T019 [P] Create `session-history-converter/src/platform/codex-serializer.ts` - Convert to Codex JSONL
- [X] T020 [P] Create `session-history-converter/src/platform/gemini-serializer.ts` - Convert to Gemini JSON
- [X] T021 [P] Create `session-history-converter/src/session/serializer.ts` with format routing to platform serializers

### Conversion Core

- [X] T022 [P] Create `session-history-converter/src/session/converter.ts` - Orchestrates parse → convert → serialize flow
- [X] T023 [P] Create `session-history-converter/src/utils/file-system.ts` - File read/write operations
- [X] T024 [P] Create `session-history-converter/src/utils/logger.ts` - Structured logging with correlation IDs
- [X] T024a [P] Create settings persistence module for sessions directory and user preferences

### Unit Tests for Core Logic

- [X] T025 [P] Create unit tests for `session-history-converter/tests/unit/parser.test.ts` - All platform parsers
- [X] T026 [P] Create unit tests for `session-history-converter/tests/unit/serializer.test.ts` - All platform serializers
- [X] T027 [P] Create unit tests for `session-history-converter/tests/unit/converter.test.ts` - Conversion correctness

**Checkpoint**: Core conversion logic complete and unit tested

---

## Phase 3: User Story 1 - Browse and Select Session (Priority: P1) 🎯 MVP

**Goal**: Users can launch TUI, view session list, and preview a selected session

**Independent Test**: Can launch app, see sessions list, select one, and view preview panel

### TUI Foundation

- [X] T028 [P] Create `session-history-converter/src/tui/app.tsx` - Main ink app component with layout
- [X] T029 [P] Create `session-history-converter/src/tui/session-list.tsx` - Session list sidebar component
- [X] T030 [P] Create `session-history-converter/src/tui/preview-panel.tsx` - Session preview panel
- [X] T031 [P] Create `session-history-converter/src/tui/components/status-bar.tsx` - Bottom status bar

### Keyboard Navigation

- [X] T032 [P] Implement arrow key navigation in session list
- [X] T033 [P] Implement Enter to select, Space to multi-select
- [X] T034 [P] Implement Tab to switch focus between list and preview

### Session Loading Integration

- [X] T035 [US1] Integrate session loading into `session-history-converter/src/tui/session-list.tsx`
- [X] T036 [US1] Integrate session preview into `session-history-converter/src/tui/preview-panel.tsx`
- [X] T037 [US1] Connect format detection to session list display
- [X] T037a [P] [US1] Implement format auto-detection logic based on file content analysis

**Checkpoint**: User Story 1 complete - users can browse and preview sessions

---

## Phase 4: User Story 2 - Claude Code to Gemini Migration (Priority: P1)

**Goal**: Users can select a Claude Code session and convert to Gemini format

**Independent Test**: Can select Claude Code session, convert to Gemini, and verify output file

### Format Selection Dialog

- [X] T038 [P] [US2] Create `session-history-converter/src/tui/dialogs/format-select.tsx` - Format dropdown dialog
- [X] T039 [P] [US2] Create `session-history-converter/src/tui/dialogs/confirm.tsx` - Conversion confirmation dialog

### Conversion Action

- [X] T040 [US2] Wire convert button to trigger conversion flow in `session-history-converter/src/tui/app.tsx`
- [X] T041 [US2] Implement session file writing with proper Gemini path resolution
- [X] T042 [US2] Add error handling with error dialog for conversion failures

### Refresh and Update

- [X] T043 [US2] Implement refresh button to reload session list after conversion
- [X] T044 [US2] Update session list to show newly created files

**Checkpoint**: User Story 2 complete - Claude Code to Gemini conversion works

---

## Phase 5: User Story 3 - Codex to Claude Code Migration (Priority: P1)

**Goal**: Users can select a Codex session and convert to Claude Code format

**Independent Test**: Can select Codex session, convert to Claude Code, and verify output is valid

### Conversion Action

- [X] T045 [US3] Implement Codex to Claude Code conversion path in converter
- [X] T046 [US3] Add Codex session path resolution and file writing
- [ ] T047 [US3] Update format selection to show Codex as source option

**Checkpoint**: User Story 3 complete - Codex to Claude Code conversion works

---

## Phase 6: User Story 4 - Bidirectional Conversion (Priority: P2)

**Goal**: Users can convert between any supported formats in all six directions

**Independent Test**: Can convert Gemini → Claude Code, Claude Code → Codex, Codex → Gemini

### All Conversion Paths

- [X] T048 [P] [US4] Verify Claude Code → Gemini path (US2 already implements one direction)
- [X] T049 [P] [US4] Verify Claude Code → Codex path
- [X] T050 [P] [US4] Verify Gemini → Claude Code path
- [X] T051 [P] [US4] Implement and verify Gemini → Codex path
- [X] T052 [P] [US4] Implement and verify Codex → Gemini path

### Format Validation

- [X] T053 [US4] Add round-trip verification (convert A→B→A should be semantically identical)
- [X] T054 [US4] Add format validation to ensure output is readable by target platform

**Checkpoint**: User Story 4 complete - all six conversion directions work

---

## Phase 7: User Story 5 - Batch Conversion (Priority: P3)

**Goal**: Users can convert multiple sessions in a single operation

**Independent Test**: Can multi-select sessions, choose target format, and convert all with proper results

### Multi-Select

- [X] T055 [US5] Implement multi-select with Space key in session list
- [X] T056 [US5] Add "Select All" action with Ctrl+A shortcut
- [X] T057 [US5] Display selected count in status bar

### Batch Processing

- [X] T058 [US5] Create `session-history-converter/src/tui/components/progress.tsx` - Progress indicator
- [X] T059 [US5] Implement batch conversion loop with progress updates
- [X] T060 [US5] Add cancel option during batch conversion
- [X] T061 [US5] Implement partial success handling (continue on error, report failures)

### Error Reporting

- [X] T062 [US5] Create error summary dialog after batch completion
- [X] T063 [US5] Implement "Convert All" action for selected sessions

**Checkpoint**: User Story 5 complete - batch conversion works

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting all user stories

- [X] T064 [P] Add settings dialog for configurable sessions directory
- [ ] T065 [P] Implement auto-refresh when sessions directory changes
- [X] T066 [P] Add "Show hidden files" option in settings
- [ ] T067 [P] Performance: Benchmark session loading for 100+ sessions
- [ ] T068 [P] Performance: Optimize parsing for large session files (>100MB)
- [ ] T068a [P] Performance: Add conversion benchmark for 100-message session in under 10 seconds
- [ ] T068b [P] Performance: Add memory profiling for large session file parsing (>100MB)
- [ ] T069 [P] Integration test with Playwright for full TUI flows
- [ ] T070 [P] Add comprehensive error messages for edge cases
- [X] T071 [P] Update quickstart.md with new keyboard shortcuts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational completion
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Stories 2-5 (P1-P3)**: Can start after Foundational, US2 is independent of US1 implementation (but uses same foundational code)

### Within Each User Story

- Parsers/Serializers before TUI integration
- Core types before platform implementations
- Unit tests before integration

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- Platform parsers (T014, T015, T016) can run in parallel
- Platform serializers (T018, T019, T020) can run in parallel
- All unit tests (T025, T026, T027) can run in parallel
- Dialog components (T038, T039) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch TUI foundational components in parallel:
Task: "Create session-history-converter/src/tui/app.tsx"
Task: "Create session-history-converter/src/tui/session-list.tsx"
Task: "Create session-history-converter/src/tui/preview-panel.tsx"
Task: "Create session-history-converter/src/tui/components/status-bar.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test browsing and preview independently
5. Demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Demo (MVP!)
3. Add User Story 2 → Test independently → Demo
4. Add User Story 3 → Test independently → Demo
5. Add User Story 4 → Test independently → Demo
6. Add User Story 5 → Test independently → Demo
7. Polish phase for final improvements

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (TUI foundation)
   - Developer B: User Stories 2-3 (conversion actions)
   - Developer C: User Stories 4-5 (advanced features)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD-lite per Constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
