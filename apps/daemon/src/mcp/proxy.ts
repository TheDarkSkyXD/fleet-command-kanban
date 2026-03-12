#!/usr/bin/env node

/**
 * MCP Proxy - Thin stdio↔HTTP bridge to daemon
 *
 * This proxy handles Claude Code's MCP protocol over stdio and forwards
 * tool calls to the daemon's HTTP API. This allows the daemon to handle
 * all tool logic with access to registered providers (Telegram, etc).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Context from environment (set by session spawner)
const PROJECT_ID = process.env.FLEET_PROJECT_ID || '';
const TICKET_ID = process.env.FLEET_TICKET_ID || '';
const BRAINSTORM_ID = process.env.FLEET_BRAINSTORM_ID || '';

async function getDaemonUrl(): Promise<string> {
  const daemonFile = path.join(os.homedir(), '.fleet-command', 'daemon.json');
  try {
    const data = JSON.parse(await fs.readFile(daemonFile, 'utf-8'));
    return `http://localhost:${data.port}`;
  } catch {
    return 'http://localhost:8443';
  }
}

async function fetchTools(daemonUrl: string): Promise<unknown[]> {
  try {
    const response = await fetch(`${daemonUrl}/mcp/tools`);
    const data = await response.json();
    return data.tools || [];
  } catch (error) {
    console.error('[MCP Proxy] Failed to fetch tools:', (error as Error).message);
    return [];
  }
}

async function callTool(
  daemonUrl: string,
  tool: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; error?: string }> {
  const response = await fetch(`${daemonUrl}/mcp/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool,
      args,
      context: {
        projectId: PROJECT_ID,
        ticketId: TICKET_ID || undefined,
        brainstormId: BRAINSTORM_ID || undefined,
      },
    }),
  });

  return response.json();
}

// Create MCP server
const server = new Server(
  { name: 'fleet-command', version: '4.0.0' },
  { capabilities: { tools: {} } }
);

let daemonUrl: string;
let cachedTools: unknown[] = [];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (cachedTools.length === 0) {
    cachedTools = await fetchTools(daemonUrl);
  }
  return { tools: cachedTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    const result = await callTool(daemonUrl, name, args || {});

    if (result.error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: result.content.map((c) => ({ type: 'text' as const, text: c.text })),
    };
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  if (!PROJECT_ID) {
    console.error('Error: FLEET_PROJECT_ID environment variable is required');
    process.exit(1);
  }
  if (!TICKET_ID && !BRAINSTORM_ID) {
    console.error('Error: Either FLEET_TICKET_ID or FLEET_BRAINSTORM_ID is required');
    process.exit(1);
  }

  daemonUrl = await getDaemonUrl();

  // Pre-fetch tools to validate daemon connection
  cachedTools = await fetchTools(daemonUrl);
  if (cachedTools.length === 0) {
    console.error('Warning: No tools fetched from daemon - is it running?');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP proxy error:', error);
  process.exit(1);
});
