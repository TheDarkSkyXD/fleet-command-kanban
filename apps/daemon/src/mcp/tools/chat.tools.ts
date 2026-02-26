// src/mcp/tools/chat.tools.ts

import type { ToolDefinition, McpContext, McpToolResult } from '../../types/mcp.types.js';
import { chatService } from '../../services/chat.service.js';
import type { ChatContext } from '../../providers/chat-provider.types.js';

export const chatTools: ToolDefinition[] = [
  {
    name: 'chat_ask',
    description:
      'Ask the user a question and wait for their response. Works via all connected chat providers.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of answer options to show as buttons',
        },
        phase: {
          type: 'string',
          description: 'Optional current phase (e.g., Refinement, Architecture) for context',
        },
        suspend: {
          type: 'boolean',
          description:
            'If true, the session will suspend after asking. The agent should exit cleanly after receiving the response. When the user answers, a new session will resume with the response.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'chat_notify',
    description:
      'Send a notification to the user (does not wait for response). Works via all connected chat providers.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The notification message to send',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'chat_init',
    description: 'Initialize chat threads for a ticket or brainstorm across all providers.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID',
        },
        ticketTitle: {
          type: 'string',
          description: 'The ticket title',
        },
      },
      required: ['ticketId', 'ticketTitle'],
    },
  },
];

function toContext(ctx: McpContext): ChatContext {
  return {
    projectId: ctx.projectId,
    ticketId: ctx.ticketId || undefined,
    brainstormId: ctx.brainstormId || undefined,
  };
}

export const chatHandlers: Record<
  string,
  (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>
> = {
  chat_ask: async (ctx, args) => {
    // Brainstorms always use async flow - session exits after asking
    if (ctx.brainstormId) {
      await chatService.askAsync(
        toContext(ctx),
        args.question as string,
        args.options as string[] | undefined,
        args.phase as string | undefined
      );
      return {
        content: [{ type: 'text', text: 'Question sent. Awaiting user response.' }],
      };
    }

    // Tickets with suspend: true use async flow (same as brainstorm)
    if (args.suspend === true) {
      await chatService.askAsync(
        toContext(ctx),
        args.question as string,
        args.options as string[] | undefined,
        args.phase as string | undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: 'Question sent. Session will suspend — exit cleanly now. You will be resumed with the answer.',
          },
        ],
      };
    }

    // Default: tickets use synchronous blocking flow
    const answer = await chatService.ask(
      toContext(ctx),
      args.question as string,
      args.options as string[] | undefined,
      args.phase as string | undefined
    );
    return {
      content: [{ type: 'text', text: answer }],
    };
  },

  chat_notify: async (ctx, args) => {
    await chatService.notify(toContext(ctx), args.message as string);
    return {
      content: [{ type: 'text', text: 'Notification sent' }],
    };
  },

  chat_init: async (ctx, args) => {
    const ticketId = (args.ticketId as string) || ctx.ticketId || ctx.brainstormId;
    const context = toContext(ctx);
    if (!context.ticketId && !context.brainstormId) {
      context.ticketId = ticketId;
    }

    await chatService.initChat(context, args.ticketTitle as string);
    return {
      content: [{ type: 'text', text: 'Chat initialized' }],
    };
  },
};
