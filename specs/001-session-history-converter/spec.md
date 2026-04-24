# Session History Converter

**Feature Branch**: `001-session-history-converter`
**Created**: 2026-04-21
**Status**: Draft
**Input**: "Tôi muốn tạo một ứng dụng TUI giúp tôi convert session history của Claude Code, Codex, Gemini lẫn nhau, ví dụ TUI thì tôi có thể list được các sessions, thao tác nó sẽ dễ hơn"

## Clarifications

### Session 2026-04-21

- Q: Should interface be TUI (interactive terminal UI) instead of CLI? → A: TUI - Interactive terminal UI with session list, navigation, dialogs

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and Select Session (Priority: P1)

A developer launches the TUI application and sees a list of available session files on their system.

**Why this priority**: Core navigation - users need to discover and select sessions before conversion.

**Independent Test**: Can launch TUI, navigate to sessions directory, and see a list of session files with metadata.

**Acceptance Scenarios**:

1. **Given** the TUI application is launched, **When** the user navigates to the sessions view, **Then** all session files are displayed in a scrollable list with filename, date, and message count
2. **Given** a session list is displayed, **When** user selects a session, **Then** preview panel shows conversation summary
3. **Given** no session files are found, **When** user opens the application, **Then** helpful message guides user to add sessions

---

### User Story 2 - Claude Code to Gemini Migration (Priority: P1)

A developer has been working on a project using Claude Code and wants to switch to Gemini temporarily while keeping their conversation context intact.

**Why this priority**: Core use case - allows users to seamlessly switch between AI assistants without losing work context.

**Independent Test**: Can select a Claude Code session, choose Gemini as target, and verify the output file contains all messages.

**Acceptance Scenarios**:

1. **Given** a session is selected in the list, **When** the user chooses "Convert to Gemini" from the action menu, **Then** conversion completes and confirmation dialog shows message count
2. **Given** a Claude Code session with code snippets is selected, **When** converted to Gemini format, **Then** all code blocks are preserved with proper formatting
3. **Given** a Claude Code session with attachments is selected, **When** converted, **Then** attachment references are correctly mapped

---

### User Story 3 - Codex to Claude Code Migration (Priority: P1)

A developer has an active Codex session and wants to continue the same conversation in Claude Code.

**Why this priority**: This was the primary example given by the user - directly enables the described workflow.

**Independent Test**: Can select a Codex session, choose Claude Code as target, and verify output is valid.

**Acceptance Scenarios**:

1. **Given** a Codex session file is selected, **When** user selects "Convert to Claude Code" from the action menu, **Then** output file is created and session list updates to show new file
2. **Given** a Codex session with multi-turn conversation is selected, **When** converted to Claude Code, **Then** message ordering is preserved
3. **Given** an invalid or corrupted session file is selected, **When** user attempts conversion, **Then** error dialog clearly indicates the issue with details

---

### User Story 4 - Bidirectional Conversion (Priority: P2)

User wants to convert between any supported formats using the format selection dialog.

**Why this priority**: Extends the core capability to all six possible direction combinations.

**Independent Test**: Can convert Gemini → Claude Code, Claude Code → Codex, and Codex → Gemini through the TUI.

**Acceptance Scenarios**:

1. **Given** a Gemini session file is selected, **When** user chooses target format from dropdown dialog, **Then** conversion proceeds with progress indicator
2. **Given** a session from any platform is selected, **When** converted to the same platform format, **Then** round-trip option confirms semantic equivalence
3. **Given** two different sessions from different platforms are selected, **When** converted to the same target format, **Then** both outputs follow the same schema

---

### User Story 4 - Batch Conversion (Priority: P3)

User has multiple session files and wants to convert them in batch.

**Why this priority**: Efficiency feature for users with many sessions to migrate.

**Independent Test**: Can convert multiple files in a single command with consistent results.

**Acceptance Scenarios**:

1. **Given** a directory with 10 session files in mixed formats, **When** user runs batch conversion to Claude Code, **Then** all 10 files are converted with proper naming
2. **Given** batch conversion with one invalid file among valid ones, **When** processing, **Then** valid files are converted and invalid ones are reported with errors

---

### Edge Cases

- What happens when session file has unsupported message types?
- How does the system handle extremely large sessions (>100MB)?
- What occurs when conversion would lose data due to format limitations?
- How are timestamps handled when crossing timezones?
- What happens if the output file already exists?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an interactive TUI with session list view, format selection dialogs, and progress indicators
- **FR-002**: System MUST automatically detect source format based on file structure when not explicitly specified
- **FR-003**: System MUST support conversion in all six direction combinations (A→B, A→C, B→A, B→C, C→A, C→B)
- **FR-004**: System MUST preserve all message content, sender attribution, timestamps, and attachments during conversion
- **FR-005**: System MUST output valid session files that are readable by the target platform
- **FR-006**: System MUST support batch conversion of multiple files via multi-select and "Convert All" action
- **FR-007**: System MUST provide clear error dialogs when input files are invalid or corrupted
- **FR-008**: System MUST support round-trip conversion verification through UI confirmation
- **FR-009**: System MUST display interactive dialogs for format selection and confirmation
- **FR-010**: System MUST provide a preview panel showing message summary before conversion
- **FR-011**: System MUST allow users to configure sessions directory via settings
- **FR-012**: System MUST show conversion progress with cancel option

### Key Entities *(include if feature involves data)*

- **Session**: A container for conversation history with metadata (platform, timestamp, message count)
- **Message**: An individual turn in the conversation with role (human/AI), content, attachments, and timestamp
- **Format**: The specific schema used by each platform (Claude Code, Codex, Gemini)
- **Conversion Rule**: Mapping logic that translates message attributes between formats

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can convert a 100-message session between any two formats in under 10 seconds
- **SC-002**: 100% of messages are preserved during conversion with correct attribution
- **SC-003**: Round-trip conversion produces files that are semantically identical to originals (verified by automated comparison)
- **SC-004**: Batch conversion of 10 files completes with 100% success rate for valid inputs
- **SC-005**: Error messages are actionable and help users resolve issues without external documentation

## Assumptions

- Session files are stored as JSON locally (each platform's native format)
- Users have access to session files via each platform's export functionality
- No authentication or cloud sync is required for v1 (local file-based operation)
- Session format schemas are stable within major versions of each platform
- All three platforms use JSON-based session formats
- TUI will use keyboard navigation (arrow keys, Enter, Esc)
