---
name: fleet-command:create-ticket
description: "Use this skill to create a new ticket in the current project. Use this to convert a brainstorm into a formal ticket for tracking development work."
---

# Creating Tickets

Use the `create_ticket` MCP tool to create tickets. Tickets are the primary unit of work tracking in Fleet Command.

## The Rule

**When work needs tracking, create a ticket. No mental tracking. No "I'll remember this."**

Work without a ticket = work that gets lost, duplicated, or forgotten.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `title` | Yes | Short, descriptive title for the ticket |
| `description` | No | Full description of the work (markdown supported) |
| `brainstormId` | No | ID of the brainstorm this ticket originated from |

## Basic Usage

```javascript
create_ticket({
  title: "Add user authentication",
});
```

## With Description

Include a description. Tickets without descriptions become "what was this for?" mysteries.

```javascript
create_ticket({
  title: "Add user authentication",
  description: `## Overview

Implement user authentication using JWT tokens.

## Requirements

- Login endpoint with email/password
- JWT token generation and validation
- Protected route middleware
- Logout endpoint

## Acceptance Criteria

- Users can log in with valid credentials
- Invalid credentials return appropriate errors
- Protected routes reject unauthenticated requests`,
});
```

## From Brainstorm

When converting a brainstorm into a ticket, you MUST include the `brainstormId`. This maintains traceability.

```javascript
create_ticket({
  title: "Implement dashboard analytics",
  description: "Analytics dashboard as discussed in brainstorm session.",
  brainstormId: "brain_abc123",
});
```

Brainstorm without ticket link = context lost forever.

## When to Create Tickets

| Situation | Action |
|-----------|--------|
| Brainstorm complete | Create ticket immediately. Not "later." Now. |
| New feature identified | Create ticket before any implementation |
| Bug discovered | Create ticket. Don't fix without tracking. |
| Refactoring planned | Create ticket. Ad-hoc refactoring = scope creep |

## Red Flags - Create a Ticket Instead

These thoughts mean you need a ticket:

- "I'll just quickly do this"
- "This is too small to track"
- "I'll remember what this was about"
- "Let me just start coding"

**All of these lead to lost work, forgotten context, or duplicated effort.**

## Ticket vs Task

| Level | Purpose | When Created |
|-------|---------|--------------|
| **Ticket** | High-level work item through phases (Refinement → Architecture → Build → Review) | At project/feature inception |
| **Task** | Smaller implementation unit within a ticket | During Build phase planning |

Create a ticket for the overall feature. Break into tasks during Build phase. Never create tasks without a parent ticket.

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "Too small for a ticket" | Small work still needs tracking. Create it. |
| "I already know what to do" | Future you won't. Document it now. |
| "Just exploring first" | Exploration belongs in a brainstorm, then ticket. |
| "Will create ticket after I'm done" | You won't. Or you'll forget details. Create first. |
