# Chat Messages Text White - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan ticket-by-ticket.

**Goal:** Make all agent chat text white across all chat components (BrainstormChat, ArtifactChat, ActivityTab) for better readability on dark backgrounds.

**Architecture:** Fix user message text color by replacing undefined `text-accent-foreground` with `text-white`. Fix system message text in ArtifactChat. All agent messages, questions, option buttons, and notification text should render as white.

**Tech Stack:** React, Tailwind CSS

---

### Ticket 1: Fix user message text color in BrainstormChat

**Context**
User messages in BrainstormChat use `text-accent-foreground` which has no corresponding CSS variable (`--color-accent-foreground` is not defined in `index.css`), so text color is undefined/inherited. Changing to `text-white` ensures readability.

**Files:**

- Modify: `apps/frontend/src/components/brainstorm/BrainstormChat.tsx:463`

**Step 1: Update user message text color**

In `apps/frontend/src/components/brainstorm/BrainstormChat.tsx`, in the `MessageBubble` function, find line 463:

```tsx
isUser && 'bg-accent/50 text-accent-foreground rounded-br-sm',
```

Replace with:

```tsx
isUser && 'bg-accent/50 text-white rounded-br-sm',
```

**Step 2: Verify the change**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add apps/frontend/src/components/brainstorm/BrainstormChat.tsx
git commit -m "fix: make user message text white in BrainstormChat"
```

---

### Ticket 2: Fix user message text color in ActivityTab

**Context**
User messages in ActivityTab also use `text-accent-foreground` which is undefined. Same fix as Ticket 1.

**Files:**

- Modify: `apps/frontend/src/components/ticket-detail/ActivityTab.tsx:408`

**Step 1: Update user message text color**

In `apps/frontend/src/components/ticket-detail/ActivityTab.tsx`, in the `MessageBubble` function, find line 408:

```tsx
isUser && 'bg-accent/50 text-accent-foreground rounded-br-sm',
```

Replace with:

```tsx
isUser && 'bg-accent/50 text-white rounded-br-sm',
```

**Step 2: Verify the change**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add apps/frontend/src/components/ticket-detail/ActivityTab.tsx
git commit -m "fix: make user message text white in ActivityTab"
```

---

### Ticket 3: Fix user message text color and system message text in ArtifactChat

**Context**
ArtifactChat has two issues: (1) user messages use `text-accent-foreground` (undefined), and (2) system messages use `text-text-muted` (gray #6e7681) making them hard to read. Both need to be white.

**Files:**

- Modify: `apps/frontend/src/components/ticket-detail/ArtifactChat.tsx:355-357`

**Step 1: Update user message text color**

In `apps/frontend/src/components/ticket-detail/ArtifactChat.tsx`, in the `MessageBubble` function, find line 355:

```tsx
isUser && 'bg-accent text-accent-foreground rounded-br-sm',
```

Replace with:

```tsx
isUser && 'bg-accent text-white rounded-br-sm',
```

**Step 2: Update system message text color**

In the same function, find line 357:

```tsx
isSystem && 'bg-bg-tertiary text-text-muted italic rounded-bl-sm',
```

Replace with:

```tsx
isSystem && 'bg-bg-tertiary text-white italic rounded-bl-sm',
```

**Step 3: Verify the change**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add apps/frontend/src/components/ticket-detail/ArtifactChat.tsx
git commit -m "fix: make user and system message text white in ArtifactChat"
```

---

### Ticket 4: Visual verification across all chat components

**Context**
All three components have been updated. Verify visually that all chat message types render with white text.

**Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Daemon and frontend start successfully

**Step 2: Verify BrainstormChat**

1. Open the app in browser at `http://localhost:5173`
2. Navigate to a project with a brainstorm session
3. Open an existing brainstorm or create a new one
4. Verify:
   - Agent question messages: white text
   - Agent notification messages: white text
   - User messages (right-aligned): white text
   - Option buttons: white text
   - Thinking indicator: white text

**Step 3: Verify ActivityTab (ticket conversation)**

1. Navigate to a ticket with conversation history
2. Click on the ticket to open the detail panel
3. Verify the Activity/Conversation tab:
   - Agent question messages: white text
   - Notification messages: white text
   - User messages (right-aligned): white text
   - Option buttons: white text
   - Artifact cards: filename and description visible

**Step 4: Verify ArtifactChat**

1. On a ticket with artifacts, click an artifact to open the viewer
2. Start an artifact chat session
3. Verify:
   - Agent question messages: white text
   - System messages: white text (was gray before)
   - User messages: white text
   - Option buttons: white text

**Step 5: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix: ensure all chat message text is white for readability"
```
