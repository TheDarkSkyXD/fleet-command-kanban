# Architecture: Chat Messages Text White

## Overview

Pure CSS/Tailwind styling change across three chat components. The codebase already uses `text-white` on inner text elements (`<p>` tags, prose blocks). The gap is that message container `<div>`s lack `text-white`, so inherited text (timestamps, any future child elements) doesn't pick up white. The fix adds `text-white` to container-level classNames across all three components for full consistency.

## Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `BrainstormChat` | Brainstorm chat message bubbles & options | `apps/frontend/src/components/brainstorm/BrainstormChat.tsx` |
| `ActivityTab` | Ticket activity chat message bubbles & options | `apps/frontend/src/components/ticket-detail/ActivityTab.tsx` |
| `ArtifactChat` | Artifact discussion message bubbles & options | `apps/frontend/src/components/ticket-detail/ArtifactChat.tsx` |

## Current State Analysis

### Already White

All three components already apply `text-white` to:
- Agent name headers (Bot icon labels)
- Markdown prose blocks (`prose-invert text-white`)
- Plain text `<p>` tags (`text-white`)
- Outline button variant for selectable options (`button.tsx` already has `text-white`)

### The Gap

Container `<div>`s for question/notification/system message types lack `text-white`. This means:
- Timestamps (`<p className="text-xs opacity-60 mt-1">`) inherit the container color, not white
- Any other child elements without explicit color will also miss white

## Changes Required

### 1. BrainstormChat — Add `text-white` to question container

**File:** `apps/frontend/src/components/brainstorm/BrainstormChat.tsx`
**Line 464:**

```typescript
// Current:
isQuestion && 'bg-accent-purple/10 rounded-bl-sm',

// Change to:
isQuestion && 'bg-accent-purple/10 text-white rounded-bl-sm',
```

### 2. BrainstormChat — Add `text-white` to notification container

**File:** `apps/frontend/src/components/brainstorm/BrainstormChat.tsx`
**Line 465:**

```typescript
// Current:
isNotification && 'bg-bg-tertiary/50 rounded-bl-sm',

// Change to:
isNotification && 'bg-bg-tertiary/50 text-white rounded-bl-sm',
```

### 3. ActivityTab — Add `text-white` to question container

**File:** `apps/frontend/src/components/ticket-detail/ActivityTab.tsx`
**Line 409:**

```typescript
// Current:
isQuestion && 'bg-accent-purple/10 rounded-bl-sm',

// Change to:
isQuestion && 'bg-accent-purple/10 text-white rounded-bl-sm',
```

### 4. ActivityTab — Add `text-white` to notification container

**File:** `apps/frontend/src/components/ticket-detail/ActivityTab.tsx`
**Line 410:**

```typescript
// Current:
isNotification && 'bg-bg-secondary border border-border rounded-bl-sm',

// Change to:
isNotification && 'bg-bg-secondary border border-border text-white rounded-bl-sm',
```

### 5. ArtifactChat — Add `text-white` to question container

**File:** `apps/frontend/src/components/ticket-detail/ArtifactChat.tsx`
**Line 356:**

```typescript
// Current:
message.type === 'question' && 'bg-bg-tertiary rounded-bl-sm',

// Change to:
message.type === 'question' && 'bg-bg-tertiary text-white rounded-bl-sm',
```

### 6. ArtifactChat — Change system message from muted to white

**File:** `apps/frontend/src/components/ticket-detail/ArtifactChat.tsx`
**Line 357:**

```typescript
// Current:
isSystem && 'bg-bg-tertiary text-text-muted italic rounded-bl-sm',

// Change to:
isSystem && 'bg-bg-tertiary text-white italic rounded-bl-sm',
```

## Data Flow

No changes. Purely presentation-layer. The existing message rendering pipeline remains:

```
SSE Events → Message State → MessageBubble Component → Tailwind Classes → White Text
```

## API Contracts

No API changes. No type changes. No interface changes.

## State Management

No state changes. Existing component state is unaffected.

## Security Considerations

- No security impact — CSS-only changes
- No new `dangerouslySetInnerHTML` usage
- Existing XSS protections (DOMPurify for markdown) remain unchanged

## Testing Strategy

**Manual Testing:**
- Open Brainstorm Chat — verify all agent text, questions, notifications, timestamps, and option buttons display white text
- Open Ticket Detail Activity Tab — verify all agent text, questions, notifications, timestamps, and option buttons display white text
- Open Artifact Chat — verify all question text, system messages, timestamps, and option buttons display white text
- Verify error messages retain their red styling (`text-destructive`)
- Verify user messages retain their `text-accent-foreground` styling
- Verify timestamps render as semi-transparent white (white at 60% opacity)

**No unit tests needed** — visual styling changes with no logic modifications.

## Dependencies

No new dependencies.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| System messages in ArtifactChat lose "muted" visual distinction | Italic styling still differentiates them; white text aligns with ticket requirement |
| Changes may conflict with uncommitted modifications to these files | Changes are additive (inserting `text-white` into existing class strings) — easy to merge |
