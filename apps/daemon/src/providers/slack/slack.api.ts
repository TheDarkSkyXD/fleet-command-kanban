import { WebClient } from "@slack/web-api";

export class SlackApi {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  /**
   * Open a DM conversation with a user. Returns the DM channel ID.
   * If a DM already exists, Slack returns the existing channel.
   */
  async openConversation(userId: string): Promise<string> {
    const result = await this.client.conversations.open({ users: userId });
    if (!result.channel?.id) {
      throw new Error("Failed to open DM conversation: no channel ID returned");
    }
    return result.channel.id;
  }

  /**
   * Post a message to a channel. If thread_ts is provided, replies in-thread.
   * Returns the message timestamp (ts), which serves as the message ID in Slack.
   */
  async postMessage(
    channel: string,
    text: string,
    options?: { thread_ts?: string },
  ): Promise<string> {
    const result = await this.client.chat.postMessage({
      channel,
      text,
      thread_ts: options?.thread_ts,
    });
    if (!result.ts) {
      throw new Error("Failed to post message: no ts returned");
    }
    return result.ts;
  }
}
