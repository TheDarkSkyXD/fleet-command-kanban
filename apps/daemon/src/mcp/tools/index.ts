import { ticketTools, ticketHandlers } from "./ticket.tools.js";
import { chatTools, chatHandlers } from "./chat.tools.js";
import { taskTools, taskHandlers } from "./task.tools.js";
import { ralphTools, ralphHandlers } from "./ralph.tools.js";
import { artifactTools, artifactHandlers } from "./artifact.tools.js";
import { answerTools, answerHandlers } from "./answer.tools.js";
import type {
  ToolDefinition,
  McpContext,
  McpToolResult,
} from "../../types/mcp.types.js";

export const allTools: ToolDefinition[] = [...ticketTools, ...chatTools, ...taskTools, ...ralphTools, ...artifactTools, ...answerTools];

export const allHandlers: Record<
  string,
  (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>
> = {
  ...ticketHandlers,
  ...chatHandlers,
  ...taskHandlers,
  ...ralphHandlers,
  ...artifactHandlers,
  ...answerHandlers,
};

export { ticketTools, chatTools, taskTools, ralphTools, artifactTools, answerTools };
export { ticketHandlers, chatHandlers, taskHandlers, ralphHandlers, artifactHandlers, answerHandlers };
