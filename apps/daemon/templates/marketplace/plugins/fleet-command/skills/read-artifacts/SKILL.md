---
name: fleet-command:read-artifacts
description: "Use this skill when you need to read ticket artifacts like refinement.md, architecture.md, or specification.md."
---

# Reading Artifacts

## The Rule

**Use the MCP tools.** Don't construct paths. Don't search.

1. `list_artifacts` - See what artifacts exist
2. `get_artifact` - Get content and metadata by filename

## Reading an Artifact

```
# List what's available
list_artifacts
→ { "artifacts": [{ "filename": "refinement.md", ... }] }

# Get specific artifact
get_artifact({ "filename": "refinement.md" })
→ { "filename": "refinement.md", "content": "...", ... }
```

# After you have successfully gotten an artifact.

use the skill: `fleet-command:notify-user` to announce:
"[Your Agent Name]: I found the following artifact and will read it as a part of my context."

## Common Artifacts

| Artifact                | Phase         | Description                          |
| ----------------------- | ------------- | ------------------------------------ |
| `refinement-draft.md`   | Refinement    | Initial requirements (may have gaps) |
| `refinement.md`         | Refinement    | Approved requirements                |
| `architecture-draft.md` | Architecture  | Initial technical design             |
| `architecture.md`       | Architecture  | Approved technical design            |
| `specification.md`      | Specification | Final spec with tasks                |

## Red Flags - STOP Immediately

| Thought                           | Reality                                 |
| --------------------------------- | --------------------------------------- |
| "Let me construct the path"       | Use `get_artifact` instead              |
| "Let me search for refinement.md" | Use `list_artifacts` to see what exists |
| "I'll use the Read tool"          | Use `get_artifact` - it handles paths   |
| "Maybe it's in ~/.fleet-command/" | MCP tools abstract storage location     |

## The Contract

1. **Always use MCP tools** - `list_artifacts` and `get_artifact`
2. **Never construct paths** - The tools handle path conversion
3. **Check before reading** - Use `list_artifacts` if unsure what exists
