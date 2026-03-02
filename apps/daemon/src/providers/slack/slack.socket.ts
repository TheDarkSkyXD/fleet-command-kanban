import { SocketModeClient } from "@slack/socket-mode";

/**
 * Minimal typed event for DM messages relevant to our use case.
 */
export interface SlackMessageEvent {
  type: string;
  user: string;
  text: string;
  channel: string;
  channel_type: string;
  thread_ts?: string;
  ts: string;
  subtype?: string;
  bot_id?: string;
}

export class SlackSocket {
  private client: SocketModeClient;

  constructor(
    appToken: string,
    private onMessage: (event: SlackMessageEvent) => Promise<void>,
  ) {
    this.client = new SocketModeClient({ appToken });

    this.client.on("message", async ({ event, ack }) => {
      // Acknowledge the event immediately (required by Socket Mode)
      try {
        await ack();
      } catch (error) {
        console.error(
          "[SlackSocket] Failed to acknowledge message:",
          (error as Error).message,
        );
        return;
      }

      const msg = event as SlackMessageEvent;

      // Ignore bot's own messages and message subtypes (edits, deletes, etc.)
      if (msg.bot_id || msg.subtype) return;

      // Only process DM messages (channel type "im")
      if (msg.channel_type !== "im") return;

      // Must have text and user
      if (!msg.text || !msg.user) return;

      try {
        await this.onMessage(msg);
      } catch (error) {
        console.error(
          "[SlackSocket] Error handling message:",
          (error as Error).message,
        );
      }
    });
  }

  /**
   * Connect to Slack via Socket Mode. Resolves when connected.
   */
  async connect(): Promise<void> {
    await this.client.start();
    console.log("[SlackSocket] Connected via Socket Mode");
  }

  /**
   * Disconnect gracefully.
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
    console.log("[SlackSocket] Disconnected");
  }
}
