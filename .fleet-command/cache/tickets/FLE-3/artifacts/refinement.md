# Refinement: Chat Messages Text White

## Problem Statement

Chat message text across Fleet Command's chat interfaces is difficult to read against the dark background. Users struggle to read agent responses, questions, and selectable options due to insufficient text contrast.

## What We're Building

A UI styling update to make all chat message text white across all chat interfaces for improved readability.

## Who It's For

All Fleet Command UI users who interact with chat-based interfaces.

## Scope

### In Scope

The following chat interfaces and their text elements:

1. **Brainstorm Chat** (`BrainstormChat.tsx`)
   - Agent response messages
   - Questions posed by agents
   - Selectable question/option buttons

2. **Ticket Detail Activity Tab** (`ActivityTab.tsx`)
   - Agent response messages
   - Questions posed by agents
   - Selectable question/option buttons

3. **Artifact Chat** (`ArtifactChat.tsx`)
   - Agent response messages
   - Questions posed by agents
   - Selectable question/option buttons

### Out of Scope

- Changes to non-chat UI elements
- Background color changes
- Layout or structural changes to chat components

## What "Done" Looks Like

- All agent response text is white and easily readable in all 3 chat interfaces
- All question text from agents is white and easily readable
- All selectable question/option elements have white text
- No regression in other UI elements

## Technical Constraints

- This is a CSS/Tailwind styling change
- Must work within the existing dark theme
- Should use Tailwind utility classes consistent with the project's styling approach

## Success Criteria

1. Open Brainstorm Chat — all agent text, questions, and selectable options display in white
2. Open Ticket Detail Activity Tab — all agent text, questions, and selectable options display in white
3. Open Artifact Chat — all agent text, questions, and selectable options display in white
4. Text is clearly legible against the background in all cases
