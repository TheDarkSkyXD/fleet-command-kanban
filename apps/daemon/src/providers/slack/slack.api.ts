import { WebClient } from "@slack/web-api";

export class SlackApi {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  /**
   * Discover a channel the bot is a member of.
   * Returns a non-#general channel the bot belongs to, or null if none exist.
   * Returns { id, name } or null if the bot isn't in any channel.
   * Requires the `channels:read` scope.
   */
  async discoverChannel(): Promise<{ id: string; name: string } | null> {
    // Identify the bot user so we can query its channel memberships
    const auth = await this.client.auth.test({});

    const result = await this.client.users.conversations({
      user: auth.user_id,
      types: "public_channel",
      exclude_archived: true,
      limit: 100,
    });

    const channels = result.channels ?? [];

    // Find a non-#general channel only
    const match = channels.find((ch) => !ch.is_general);
    if (match?.id && match?.name) {
      return { id: match.id, name: match.name };
    }
    return null;
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
