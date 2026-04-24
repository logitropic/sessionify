# Data Model: Session History Converter

## Entity Overview

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  SessionFile    │────▶│     Session      │────▶│    Message      │
│  (file on disk) │     │  (loaded data)   │     │  (conversation)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
  - platform              - id (UUID)              - id (UUID)
  - path                 - platform               - role
  - detectedFormat       - createdAt              - content
                          - updatedAt              - timestamp
                          - title                 - attachments
                          - cwd                   - toolCalls
                          - messages              - metadata
                          - metadata
```

---

## Entity Definitions

### SessionFile

Represents a session file on disk.

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Absolute file path |
| `platform` | `Platform` | Source platform |
| `format` | `SessionFormat` | Format variant |
| `size` | `number` | File size in bytes |
| `modifiedAt` | `Date` | Last modified |
| `sessionId` | `string` | Platform's session ID |

### Platform

```typescript
type Platform = 'claude-code' | 'codex' | 'gemini'
```

### SessionFormat

```typescript
type SessionFormat =
  | { type: 'claude-code'; variant: 'ndjson' }
  | { type: 'codex'; variant: 'jsonl' }
  | { type: 'gemini'; variant: 'json' }
```

### Session

The canonical session object after loading from any platform.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `UUID` | Yes | Unique session identifier |
| `platform` | `Platform` | Yes | Source platform |
| `createdAt` | `ISO8601` | Yes | Session creation time |
| `updatedAt` | `ISO8601` | Yes | Last update time |
| `title` | `string` | No | Session title/summary |
| `cwd` | `string` | No | Working directory |
| `messages` | `Message[]` | Yes | Conversation messages |
| `metadata` | `Record<string, unknown>` | No | Platform-specific data |

### Message

Individual conversation turn.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `UUID` | Yes | Unique message ID |
| `role` | `'user' \| 'assistant' \| 'system'` | Yes | Message author |
| `content` | `string` | Yes | Text content (normalized) |
| `timestamp` | `ISO8601` | Yes | Message creation time |
| `attachments` | `string[]` | No | File paths or references |
| `toolCalls` | `ToolCall[]` | No | Tool invocations |
| `metadata` | `Record<string, unknown>` | No | Platform-specific data |

### ToolCall

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `UUID` | Yes | Unique tool call ID |
| `name` | `string` | Yes | Tool function name |
| `arguments` | `string` | Yes | Serialized arguments |
| `result` | `string` | No | Tool output |

---

## Platform-Specific Mappings

### Claude Code (NDJSON/JSONL)

| Common Field | Source Field |
|--------------|--------------|
| `id` | `sessionId` from LogOption or `uuid` for messages |
| `createdAt` | `created` Date |
| `updatedAt` | `modified` Date |
| `messages[].role` | `type: 'user'` → `user`, `type: 'assistant'` → `assistant` |
| `messages[].content` | `message.content` (string or structured) |

### Codex (JSONL)

| Common Field | Source Field |
|--------------|--------------|
| `id` | `SessionMeta.id` (ThreadId) |
| `createdAt` | `SessionMeta.timestamp` |
| `messages[].role` | `role: "user"` → `user`, `role: "assistant"` → `assistant` |
| `messages[].content` | `content[].text` flattened |

### Gemini CLI (JSON)

| Common Field | Source Field |
|--------------|--------------|
| `id` | `sessionId` |
| `createdAt` | `startTime` |
| `messages[].role` | `type: 'user'` → `user`, `type: 'gemini'` → `assistant` |
| `messages[].content` | `content` (PartListUnion text extraction) |

---

## State Transitions

### Session States

```
     ┌──────────┐
     │  NEW     │ (file detected, not loaded)
     └────┬─────┘
          │ load()
          ▼
     ┌──────────┐
     │  LOADED  │ (parsed, ready for conversion)
     └────┬─────┘
          │ convert()
          ▼
     ┌──────────┐
     │ CONVERTED │ (output written)
     └──────────┘
```

### Conversion Flow

```
SessionFile (platform A)
    │
    ▼
Parser → Session (common format)
    │
    ▼
Converter → Session (common format)
    │
    ▼
Serializer → SessionFile (platform B)
```

---

## Validation Rules

1. **Session must have at least one message** - Empty sessions are invalid
2. **Messages must have valid roles** - Only `user`, `assistant`, `system` allowed
3. **Timestamps must be parseable** - ISO8601 or RFC3339
4. **ToolCall.arguments must be valid JSON** - String must parse to object
5. **Session ID must be non-empty** - UUID or platform-specific ID

---

## Key Files

| File | Purpose |
|------|---------|
| `src/session/types.ts` | Core type definitions |
| `src/session/parser.ts` | Format detection and parsing |
| `src/session/serializer.ts` | Session to format conversion |
| `src/session/converter.ts` | Common format transformations |
| `src/session/detector.ts` | Auto-detect format from file content |
