# Research: Session Format Analysis

## Executive Summary

Three AI assistant session formats analyzed: Claude Code (NDJSON), Codex (JSONL), and Gemini CLI (JSON). All store conversation history but with different schemas. A common interchange format enables bidirectional conversion.

---

## Decision: Technology Stack

**Language**: TypeScript (native TUI frameworks like Bubble Tea are Go-based; TypeScript aligns with Claude Code's codebase and provides better DX for this project)

**TUI Framework**: `ink` (React-like for CLIs) or `箔` (bubbletea wrapper) - **NEEDS CLARIFICATION**: See Question 1 below

**Key Dependencies**: `vue` or `react` for TUI components, JSON parsing standard library

---

## Session Format Analysis

### Claude Code

**Storage**: NDJSON (one JSON object per line, `.jsonl` extension)
**Location**: `~/.claude/projects/<sanitized-project-path>/<sessionId>.jsonl`

**Session Schema** (LogOption):
```typescript
{
  date: string
  messages: SerializedMessage[]
  sessionId: string
  created: Date
  modified: Date
  firstPrompt: string
  messageCount: number
  // ... additional metadata
}
```

**Message Types** (Entry union):
- `TranscriptMessage` - User/assistant messages with `parentUuid` chain
- `SummaryMessage`, `CustomTitleMessage`, `AiTitleMessage`
- `LastPromptMessage`, `TagMessage`, `AgentNameMessage`
- `FileHistorySnapshotMessage`, `AttributionSnapshotMessage`
- `ContextCollapseCommitEntry`, `ContextCollapseSnapshotEntry`

**Message Fields** (SerializedMessage):
```typescript
{
  type: 'user' | 'assistant' | 'attachment' | 'system'
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  timestamp: string
  uuid: string
  sessionId: string
  parentUuid: string | null
  cwd: string
}
```

**Format Notes**:
- NDJSON lines have varying `type` discriminators
- Parent-child message chain via `parentUuid`
- Multiple message types beyond plain conversation

---

### Codex

**Storage**: JSONL (one JSON object per line)
**Location**: `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`

**Session Schema** (first line is SessionMeta):
```json
{
  "id": "5973b6c0-94b8-487b-a530-2aeb6098ae0e",
  "timestamp": "2025-05-07T17:24:21.123Z",
  "cwd": "/path/to/project",
  "originator": "claude-code",
  "model_provider": "anthropic",
  "source": "cli"
}
```

**Message Types** (RolloutItem enum):
- `SessionMeta` - First line, session metadata
- `Message` - User/assistant messages with `role: "user" | "assistant" | "developer"`
- `Reasoning` - AI reasoning traces
- `FunctionCall` / `FunctionCallOutput` - Tool interactions
- `ToolSearchCall` / `ToolSearchOutput`
- `WebSearchCall`
- `ImageGenerationCall`
- `GhostSnapshot`, `Compaction`, `LocalShellCall`

**Message Fields** (ResponseItem.Message):
```typescript
{
  role: string  // "user", "assistant", "developer"
  content: ContentItem[]  // InputText, InputImage, OutputText
  end_turn?: boolean
  phase?: 'commentary' | 'final_answer'
}
```

**Format Notes**:
- First line is always SessionMeta
- Uses JSONL format (one object per line)
- ContentItem enum: InputText, InputImage, OutputText

---

### Gemini CLI

**Storage**: JSON (single object per file)
**Location**: `~/.gemini/tmp/<project_hash>/chats/session-<timestamp>-<id>.json`

**Session Schema** (ConversationRecord):
```typescript
{
  sessionId: string
  projectHash: string
  startTime: string  // ISO timestamp
  lastUpdated: string
  messages: MessageRecord[]
  summary?: string
  directories?: string[]
  kind?: 'main' | 'subagent'
}
```

**Message Types** (MessageRecord):
- `user` - User messages
- `gemini` - AI responses (with toolCalls, thoughts, tokens)
- `info`, `error`, `warning` - System messages

**Message Fields** (BaseMessageRecord):
```typescript
{
  id: string  // UUID
  type: 'user' | 'gemini' | 'info' | 'error' | 'warning'
  timestamp: string  // ISO
  content: PartListUnion  // text, images, etc.
  displayContent?: PartListUnion
}
```

**Format Notes**:
- Regular JSON (not JSONL)
- AI messages have additional fields: `toolCalls`, `thoughts`, `tokens`, `model`
- `PartListUnion` supports multiple content types (text, images)

---

## Common Schema Design

To enable conversion between all three formats, we define a **CommonSessionFormat**:

```typescript
interface CommonSession {
  id: string              // Unique session identifier
  platform: 'claude-code' | 'codex' | 'gemini'
  createdAt: string      // ISO timestamp
  updatedAt: string      // ISO timestamp
  title?: string         // Session title/summary
  cwd?: string           // Working directory
  messages: CommonMessage[]
  metadata: Record<string, unknown>  // Platform-specific extras
}

interface CommonMessage {
  id: string              // Unique message identifier
  role: 'user' | 'assistant' | 'system'
  content: string        // Text content (normalized)
  timestamp: string       // ISO timestamp
  attachments?: string[]  // File references
  toolCalls?: CommonToolCall[]
  metadata: Record<string, unknown>  // Platform-specific extras
}

interface CommonToolCall {
  id: string
  name: string
  arguments: string
  result?: string
}
```

---

## Conversion Mapping

### Claude Code → Common
- Session ID from `sessionId` field
- Messages: Map `type: 'user'` → `role: 'user'`, `type: 'assistant'` → `role: 'assistant'`
- Content: Pass through (already string or structured)
- Timestamps: Parse ISO format

### Codex → Common
- Session ID from `SessionMeta.id`
- Messages: Map `role: "user"` → `role: 'user'`, `role: "assistant"` → `role: 'assistant'`
- Content: Flatten `ContentItem[]` to string (concatenate text)
- Timestamps: Parse RFC3339

### Gemini → Common
- Session ID from `sessionId`
- Messages: Map `type: 'user'` → `role: 'user'`, `type: 'gemini'` → `role: 'assistant'`
- Content: Extract text from `PartListUnion`
- Timestamps: Already ISO

---

## Open Questions

| Question | Impact | Options |
|----------|--------|---------|
| TUI Framework choice | High - determines tech stack | A: ink (React-like), B: enquirer (simpler), C: bespoke |
| Batch conversion UX | Medium - affects UI design | Multi-select list, glob pattern, directory mode |

---

## Next Steps

1. Finalize TUI framework choice
2. Design data model for TUI components
3. Define conversion library interface
