---
name: fleet-command:update-ralph-loop
description: "Use this to update the status of a ralph loop status for any iterative workflow. Controls whether to continue iterating, complete successfully, or escalate when blocked."
---

# Updating Ralph Loop

## The Rule

**When your review is complete, call the `ralph_loop_dock` immediately.** Not after cleanup. Not after one more check. Immediately.

```
Review done → ralph_loop_dock() → Nothing else
```

## The Tool

```typescript
ralph_loop_dock({
  approved: boolean,      // true = work is good, false = needs revision
  feedback?: string       // REQUIRED when approved=false
})
```

## When to Approve

Call `ralph_loop_dock({ approved: true })` when:

- All requirements are met
- Tests pass
- No blocking issues remain

## When to Reject

Call `ralph_loop_dock({ approved: false, feedback: "..." })` when work needs revision.

**Your feedback is injected into the next iteration.** The builder will see exactly what you wrote. Be specific. Be actionable.

| Bad Feedback       | Good Feedback                                                                |
| ------------------ | ---------------------------------------------------------------------------- |
| "Needs work"       | "Missing error handling for network timeouts in fetchUser()"                 |
| "Tests incomplete" | "No tests for edge case: empty input array in processItems()"                |
| "Not quite right"  | "Button placement violates design spec - should be right-aligned per mockup" |

## When to Block

If you cannot approve AND revision won't help (missing requirements, need user input, fundamental design question), still call:

```typescript
ralph_loop_dock({
  approved: false,
  feedback:
    "BLOCKED: Cannot proceed without user clarification on auth strategy",
});
```

The system handles escalation. Your job is to signal.

## Red Flags - STOP Immediately

These thoughts mean you're avoiding the tool:

| Thought                               | Reality                                                |
| ------------------------------------- | ------------------------------------------------------ |
| "I'll just note this in the code"     | Notes don't signal the orchestrator. Call the tool.    |
| "The exit code will handle it"        | Exit codes lose your feedback. Call the tool.          |
| "I need to do one more thing first"   | Review is done when review is done. Call the tool now. |
| "This is obvious, no feedback needed" | If rejected, feedback is required. Always explain why. |

## The Contract

1. **One call per review** - Call `ralph_loop_dock` exactly once at the end of your review
2. **Feedback on rejection** - If `approved: false`, explain what's wrong
3. **No file updates** - The tool handles storage. Don't write to ralph loop files.
4. **Immediate call** - When your verdict is clear, call immediately

## What Happens Next

- **Approved:** Loop completes, phase advances
- **Rejected + attempts remain:** Builder gets your feedback, tries again
- **Rejected + max attempts:** Ticket blocks, user notified

Your feedback directly shapes the next iteration. Make it count.
