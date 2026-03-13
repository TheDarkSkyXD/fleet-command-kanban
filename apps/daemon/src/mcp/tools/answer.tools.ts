import type {
  ToolDefinition,
  McpContext,
  McpToolResult,
} from "../../types/mcp.types.js";

export const answerTools: ToolDefinition[] = [
  {
    name: "answer_question",
    description:
      "Submit an answer to a pending question on behalf of the user. Used by answer bot agents when a phase is automated.",
    inputSchema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description: "The answer to submit",
        },
      },
      required: ["answer"],
    },
  },
];

async function submitAnswer(
  ctx: McpContext,
  answer: string,
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${ctx.daemonUrl}/api/tickets/${encodeURIComponent(ctx.projectId)}/${ctx.ticketId}/answer-question`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to submit answer: ${response.statusText}`);
  }
  return response.json();
}

export const answerHandlers: Record<
  string,
  (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>
> = {
  answer_question: async (ctx, args) => {
    if (!ctx.ticketId) {
      throw new Error("Missing context.ticketId — answer_question requires a ticket context");
    }
    if (!args.answer || typeof args.answer !== "string") {
      throw new Error("Missing required field: answer (string)");
    }

    await submitAnswer(ctx, args.answer);

    return {
      content: [
        {
          type: "text",
          text: `Answer submitted: ${args.answer}`,
        },
      ],
    };
  },
};
