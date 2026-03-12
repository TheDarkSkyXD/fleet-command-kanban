---
name: fleet-command:create-artifacts
description: "You MUST use this skill in order to create, update, edit, or build artifacts or files.  Artifacts can be of any type but are typically markdown files."
---

## Overview

This skill provides guidence on how to properly write and save an artifact.

To create an artifact perform the following steps:

1. Write the artifact and save it.
2. Attach the artifact to the ticket.

## Writing Artifacts

Artifacts are saved to `.fleet-command/cache/tickets/{ticketId}/artifacts/` where `{ticketId}` is the current ticket/ticket identifier.

Example:

```
.fleet-command/cache/tickets/POT-2/artifacts/refinement.md
.fleet-command/cache/tickets/POT-2/artifacts/architecture.md
.fleet-command/cache/tickets/POT-2/artifacts/diagram.pdf
```

1. Determine the current `ticketId` from context
2. Write the artifact to the appropriate file

## Attaching the Artifact

Artifact files can and should be attached to tickets, to attach an artifact to a ticket you must using the `attach_artifact` MCP tool:

```
attach_artifact(
  file_path: ".fleet-command/cache/tickets/{ticketId}/artifacts/{artifact-name}.{ext}",
  artifact_type: ".md" | ".txt" | ".pdf" | etc.,
  description: "Optional description of the artifact"
)
```

**Example:**

```
attach_artifact(
  file_path: ".fleet-command/cache/tickets/POT-2/artifacts/refinement.md",
  artifact_type: ".md",
  description: "Initial requirements refinement"
)
```

## Guidelines

- **Always use the ticketId** - Never save artifacts without a ticket context
- **Overwrite/update allowed** - Artifacts can be updated/overwritten as needed
