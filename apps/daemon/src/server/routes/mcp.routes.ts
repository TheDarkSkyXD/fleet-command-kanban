import type { Express, Request, Response } from "express";
import { DEFAULT_PORT } from "@fleet-command/shared";
import { allTools, allHandlers } from "../../mcp/tools/index.js";
import { appendTicketLog } from "../../stores/ticket-log.store.js";
import type { McpContext } from "../../types/mcp.types.js";

export function registerMcpRoutes(app: Express): void {
  // List available tools
  app.get("/mcp/tools", (_req: Request, res: Response) => {
    res.json({ tools: allTools });
  });

  // Call a tool
  app.post("/mcp/call", async (req: Request, res: Response) => {
    try {
      const { tool, args, context } = req.body as {
        tool: string;
        args: Record<string, unknown>;
        context: {
          projectId: string;
          ticketId?: string;
          brainstormId?: string;
        };
      };

      if (!tool) {
        res.status(400).json({ error: "Missing tool name" });
        return;
      }

      // Log the MCP tool call
      const contextId = context?.ticketId || context?.brainstormId || "unknown";
      console.log(`[MCP] ${tool} called for ${contextId}`);

      // Also log to ticket-specific log file
      if (context?.projectId && context?.ticketId) {
        await appendTicketLog(
          context.projectId,
          context.ticketId,
          `[MCP] ${tool} called`,
        );
      }

      if (!context?.projectId) {
        res.status(400).json({ error: "Missing context.projectId" });
        return;
      }

      const handler = allHandlers[tool];
      if (!handler) {
        res.status(404).json({ error: `Unknown tool: ${tool}` });
        return;
      }

      // Build MCP context with daemon URL
      const port = req.socket.localPort || DEFAULT_PORT;
      const mcpContext: McpContext = {
        projectId: context.projectId,
        ticketId: context.ticketId || "",
        brainstormId: context.brainstormId || "",
        daemonUrl: `http://localhost:${port}`,
      };

      const result = await handler(mcpContext, args || {});

      res.json({
        content: result.content,
      });
    } catch (error) {
      res.status(500).json({
        error: (error as Error).message,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      });
    }
  });
}
