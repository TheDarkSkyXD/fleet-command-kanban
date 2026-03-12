---
name: fleet-command:ask-question
description: "You MUST use this anytime you want to ask the user a question or feel like something is unclear. If you think you want to use the AskUserQuestion tool, first invoke this skill, we may have a different way of asking the user a question."
---

# Asking Questions

## Overview

Use the `chat_ask` MCP tool to ask the user questions. This is the preferred method over `AskUserQuestion` because it integrates with the fleet-command chat system and provides a better user experience.

## Using chat_ask

Asking multiple choice questions gives us the extra superpower of getting the answers we need quickly.
For multiple choice questions:

```javascript
chat_ask({
  question: "What problem are you trying to solve?",
  options: [
    "1. Performance issue",
    "2. Missing feature",
    "3. Bug fix",
    "4. Refactoring",
  ],
});
```

For open-ended questions:

```javascript
chat_ask({
  question: "Can you describe what you have in mind?",
});
```

## Guidelines

- **ALWAYS USE chat_ask** - Always use `chat_ask` over `AskUserQuestion` when available
- **Multiple choice when possible** - We strongly prefer multiple choice questions for users to answer than open-ended
- **Numbered choices for mulitple choice questions** - Always number your choices clearly for multiple choice questions.
- **One question at a time** - We actually get rewarded if we are able to stick to 1 question at a time. Don't overwhelm the user with multiple questions
- **Be specific** - Clear questions get better answers

## Tool Reference

| Tool       | Purpose                                       |
| ---------- | --------------------------------------------- |
| `chat_ask` | Ask the user a question and wait for response |
