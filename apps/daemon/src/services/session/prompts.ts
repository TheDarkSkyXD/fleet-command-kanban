import type {
  Ticket,
  TicketImage,
  TicketPhase,
} from "../../types/ticket.types.js";
import type { AgentWorker } from "../../types/template.types.js";
import {
  getArtifactContent,
  listArtifacts,
} from "../../stores/ticket.store.js";
import {
  getRalphFeedbackForLoop,
  getRalphIterations,
  type RalphFeedback,
} from "../../stores/ralph-feedback.store.js";

/**
 * Load context artifacts based on agent's artifact configuration.
 * Supports glob patterns like "architecture-critique-*.md".
 */
async function loadContextArtifacts(
  projectId: string,
  ticketId: string,
  artifactPatterns: string[],
): Promise<{ name: string; content: string }[]> {
  const results: { name: string; content: string }[] = [];

  for (const pattern of artifactPatterns) {
    try {
      if (pattern.includes("*")) {
        // Handle glob pattern - list all artifacts and filter
        const allArtifacts = await listArtifacts(projectId, ticketId);
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        const matchingArtifacts = allArtifacts.filter((a) =>
          regex.test(a.filename),
        );

        for (const artifact of matchingArtifacts) {
          try {
            const content = await getArtifactContent(
              projectId,
              ticketId,
              artifact.filename,
            );
            results.push({ name: artifact.filename, content });
          } catch {
            // Skip artifacts that can't be read
          }
        }
      } else {
        // Direct artifact name
        const content = await getArtifactContent(projectId, ticketId, pattern);
        results.push({ name: pattern, content });
      }
    } catch {
      // Artifact doesn't exist yet, skip it
    }
  }

  return results;
}

/**
 * Format images section for prompt.
 */
function formatImages(images: TicketImage[]): string {
  if (images.length === 0) return "";
  return (
    "\n## Attached Images\n\n" +
    images.map((img) => `- ${img.name}: ${img.path}`).join("\n") +
    "\n"
  );
}

/**
 * Format artifacts section for prompt.
 */
function formatArtifacts(
  artifacts: { name: string; content: string }[],
): string {
  if (artifacts.length === 0) return "";
  return artifacts
    .map(({ name, content }) => `\n## ${name}\n\n${content}`)
    .join("\n");
}

/**
 * Format previous rejection attempts for builder prompt injection.
 */
function formatPreviousAttempts(
  feedback: RalphFeedback,
  iterations: import("../../stores/ralph-feedback.store.js").RalphIteration[]
): string {
  if (iterations.length === 0) {
    return "";
  }

  const rejections = iterations.filter((i) => !i.approved);
  if (rejections.length === 0) {
    return "";
  }

  const currentIteration = iterations.length + 1;
  let section = `## Previous Attempts\n\n`;
  section += `This is iteration ${currentIteration} of ${feedback.maxAttempts}. Previous attempts were rejected:\n\n`;

  for (const iter of rejections) {
    section += `### Iteration ${iter.iteration}\n`;
    section += `- Reviewer: ${iter.reviewer}\n`;
    section += `- Feedback: ${iter.feedback}\n\n`;
  }

  return section;
}

/**
 * Build a full prompt for an agent, combining agent instructions with ticket context.
 * Agent instructions are passed directly via --print, not via --agents flag.
 */
export async function buildAgentPrompt(
  projectId: string,
  ticketId: string,
  ticket: Ticket,
  phase: TicketPhase,
  agent: AgentWorker,
  images: TicketImage[],
  agentPrompt?: string,
  ralphContext?: {
    phaseId: string;
    ralphLoopId: string;
    taskId: string | null;
  }
): Promise<string> {
  // AgentWorker doesn't have context.artifacts - this is now handled by agent-loader
  const contextArtifacts: string[] = [];
  const artifacts = await loadContextArtifacts(
    projectId,
    ticketId,
    contextArtifacts,
  );

  // Load ralph feedback if in a ralph loop
  let previousAttemptsSection = "";
  if (ralphContext) {
    const feedback = getRalphFeedbackForLoop(
      ticketId,
      ralphContext.phaseId,
      ralphContext.ralphLoopId,
      ralphContext.taskId || undefined
    );
    if (feedback) {
      const iterations = getRalphIterations(feedback.id);
      previousAttemptsSection = formatPreviousAttempts(feedback, iterations);
    }
  }

  const context = `## Context

**Project:** ${projectId}
**Ticket:** ${ticketId}
**Title:** ${ticket.title}
**Phase:** ${phase}

## Ticket Description

${ticket.description || "No description provided."}
${formatImages(images)}${formatArtifacts(artifacts)}${previousAttemptsSection}Begin.`;

  // If agent instructions provided, prepend them to the context
  if (agentPrompt) {
    return `${agentPrompt}\n\n---\n\n${context}`;
  }

  return context;
}

/**
 * Build a prompt for an assistant session.
 * The assistant is a per-project conversational AI that can analyze the codebase
 * and manage tickets/tasks, but should not modify source code.
 */
export function buildAssistantPrompt(
  projectId: string,
  brainstormId: string,
  brainstorm: { name: string },
  options?: {
    pendingContext?: { question: string; response: string };
    initialMessage?: string;
  },
): string {
  const { pendingContext, initialMessage } = options ?? {};

  let instructions = `You are a project assistant for this codebase. Your role is to:

- Answer questions about the project's code, architecture, and patterns
- Help the user understand how things work by reading and searching files
- Assist with managing tickets and tasks using the available MCP tools
- Provide architectural guidance and suggestions

**Important:** You should NOT modify any source code files. You are a read-only assistant that helps the user understand and navigate the project. Use your tools to read files, search for code, and explore the codebase.

## Formatting

Always format your responses using **Markdown**. Use:
- **Bold** for emphasis and key terms
- Bullet points and numbered lists for structured information
- \`code\` for file names, function names, and technical terms
- Code blocks with language tags for code snippets
- Headers (##, ###) to organize longer responses

Keep responses clear, well-structured, and scannable.

## Communication

**IMPORTANT:** Always use \`chat_ask\` to send your response to the user. This is your primary communication tool — it sends your message and keeps the session alive waiting for the user's next message.

Use \`chat_notify\` to keep the user informed when you're about to do something that takes time. Examples:
- Before searching files: \`chat_notify("Searching the codebase...")\`
- Before reading multiple files: \`chat_notify("Reading the relevant source files...")\`
- When analyzing results: \`chat_notify("Found 5 files, analyzing...")\`
Always notify BEFORE doing the work so the user knows what's happening.

Every response MUST end with a \`chat_ask\` call with the \`options\` parameter. Always provide 2-4 clickable quick-reply options relevant to the context. Examples:
- After answering a question: \`options: ["Tell me more", "Show me the code", "Ask something else"]\`
- After exploring code: \`options: ["Explain this further", "Find related files", "Create a ticket"]\`
- General: \`options: ["Explore the codebase", "Manage tickets", "Ask a question"]\`

When managing work items:
- Use \`create_ticket\` to help the user create new tickets
- Use \`create_task\` to break down work into tasks
- Use \`get_ticket\` to look up ticket details
`;

  if (pendingContext) {
    instructions += `\n## Resuming Conversation

The previous session ended before processing the user's response. Here is the context:

**Your last question:** ${pendingContext.question}

**User's response:** ${pendingContext.response}

Continue the conversation from here. Do NOT ask a new opening question - the user has already responded. Process their answer and continue helping them.`;
  } else if (initialMessage) {
    instructions += `\n## User's Message

The user said: "${initialMessage}"

Respond appropriately. For greetings, simple messages, or conversational replies, respond IMMEDIATELY with \`chat_ask\` — do NOT search the codebase, read files, or use any tools. Just reply directly.

Only use tools (Read, Grep, Glob) when the user asks a specific question about the code, project architecture, or needs you to look something up. For those longer operations, use \`chat_notify\` first to tell the user what you're doing.`;
  } else {
    instructions += `\nBegin by asking how you can help with this project.`;
  }

  return `
## Context

**Project:** ${projectId}
**Assistant ID:** ${brainstormId}
**Session Name:** ${brainstorm.name}

## Instructions

${instructions}`;
}

/**
 * Build a prompt for a brainstorm session.
 */
export function buildBrainstormPrompt(
  projectId: string,
  brainstormId: string,
  brainstorm: { name: string },
  options?: {
    pendingContext?: { question: string; response: string };
    initialMessage?: string;
  },
): string {
  const { pendingContext, initialMessage } = options ?? {};

  let instructions = `Help the user explore and refine their idea.
`;

  if (pendingContext) {
    instructions += `## Resuming Conversation

The previous session ended before processing the user's response. Here is the context:

**Your last question:** ${pendingContext.question}

**User's response:** ${pendingContext.response}

Continue the conversation from here. Do NOT ask a new opening question - the user has already responded. Process their answer and continue the brainstorm.`;
  } else if (initialMessage) {
    instructions += `## User's Starting Idea

The user has already shared what they want to brainstorm:

"${initialMessage}"

Acknowledge their idea and ask your first clarifying question. Do NOT ask "what would you like to brainstorm?" - they already told you.`;
  } else {
    instructions += `Begin by greeting the user and asking what they'd like to brainstorm. Include options like ["Feature idea", "Technical question", "Bug or issue", "Just exploring"] so they can quickly choose.`;
  }

  return `
## Context

**Project:** ${projectId}
**Brainstorm ID:** ${brainstormId}
**Session Name:** ${brainstorm.name}
**SpudMode:** You are a SuperSpud.

## Instructions

${instructions}`;
}
