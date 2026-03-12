import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { SlackProvider } from "../slack.provider.js";
import type { ChatContext, OutboundMessage } from "../../chat-provider.types.js";

// We test the provider by calling its public methods directly.
// SlackApi and SlackSocket are injected as constructor dependencies.

function createMockApi() {
  return {
    discoverChannel: mock.fn(async () => ({ id: "C_DISCOVERED", name: "fleet-command" })),
    postMessage: mock.fn(
      async (_channel: string, _text: string, _opts?: { thread_ts?: string }) =>
        "1234567890.123456",
    ),
  };
}

function createMockSocket() {
  return {
    connect: mock.fn(async () => {}),
    disconnect: mock.fn(async () => {}),
  };
}

// Mock scanAllChatThreads at module level — returns empty map by default
const mockScanAllChatThreads = mock.fn(async () => new Map());

describe("SlackProvider", () => {
  let provider: SlackProvider;
  let mockApi: ReturnType<typeof createMockApi>;
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    mockApi = createMockApi();
    mockSocket = createMockSocket();
    provider = new SlackProvider();
    // Inject mocks via the test helper method
    provider._injectForTest(mockApi as any, mockSocket as any, mockScanAllChatThreads as any);
  });

  describe("capabilities", () => {
    it("should have correct id and name", () => {
      assert.strictEqual(provider.id, "slack");
      assert.strictEqual(provider.name, "Slack");
    });

    it("should declare threads=true, buttons=false, formatting=markdown", () => {
      assert.deepStrictEqual(provider.capabilities, {
        threads: true,
        buttons: false,
        formatting: "markdown",
      });
    });
  });

  describe("createThread", () => {
    it("should throw when channelId is not resolved", async () => {
      const context: ChatContext = { projectId: "proj1", ticketId: "T-1" };

      await assert.rejects(
        () => provider.createThread(context, "Test ticket"),
        (err: Error) => {
          assert.match(err.message, /Slack channel not resolved/);
          return true;
        },
      );
    });

    it("should create thread when channelId is set", async () => {
      provider._setChannelIdForTest("C_TEST_CHANNEL");

      const context: ChatContext = { projectId: "proj1", ticketId: "T-1" };
      const thread = await provider.createThread(context, "Test ticket");

      assert.strictEqual(thread.providerId, "slack");
      assert.strictEqual(thread.threadId, "C_TEST_CHANNEL");
      assert.strictEqual((thread.metadata as any).channel, "C_TEST_CHANNEL");
      assert.strictEqual((thread.metadata as any).thread_ts, "1234567890.123456");

      // Should have posted a welcome message to the channel
      assert.strictEqual(mockApi.postMessage.mock.calls.length, 1);
      const postCall = mockApi.postMessage.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "C_TEST_CHANNEL");
      assert.match(postCall[1], /Test ticket/);
    });

    it("should not call openConversation (no DM logic)", async () => {
      provider._setChannelIdForTest("C_TEST_CHANNEL");

      const context: ChatContext = { projectId: "proj1", ticketId: "T-1" };
      await provider.createThread(context, "Test ticket");

      // discoverChannel exists on API but openConversation should not be called
      assert.strictEqual(mockApi.postMessage.mock.calls.length, 1);
    });

    it("should cache thread for subsequent getThread calls", async () => {
      provider._setChannelIdForTest("C_TEST_CHANNEL");

      const context: ChatContext = { projectId: "proj1", ticketId: "T-1" };
      const created = await provider.createThread(context, "Test");
      const retrieved = await provider.getThread(context);

      assert.deepStrictEqual(retrieved, created);
    });
  });

  describe("send", () => {
    it("should translate markdown to mrkdwn and post in-thread", async () => {
      const thread = {
        providerId: "slack",
        threadId: "C_CHANNEL",
        metadata: {
          channel: "C_CHANNEL",
          thread_ts: "111.222",
        },
      };
      const message: OutboundMessage = {
        text: "**Bold** question",
      };

      await provider.send(thread, message);

      assert.strictEqual(mockApi.postMessage.mock.calls.length, 1);
      const args = mockApi.postMessage.mock.calls[0].arguments;
      assert.strictEqual(args[0], "C_CHANNEL");
      assert.match(args[1], /\*Bold\* question/);
      assert.deepStrictEqual(args[2], { thread_ts: "111.222" });
    });
  });

  describe("notifyAnswered", () => {
    it("should post acknowledgment in-thread", async () => {
      const thread = {
        providerId: "slack",
        threadId: "C_CHANNEL",
        metadata: {
          channel: "C_CHANNEL",
          thread_ts: "111.222",
        },
      };

      await provider.notifyAnswered(thread, "option A");

      assert.strictEqual(mockApi.postMessage.mock.calls.length, 1);
      const args = mockApi.postMessage.mock.calls[0].arguments;
      assert.strictEqual(args[0], "C_CHANNEL");
      assert.match(args[1], /Already answered/);
      assert.match(args[1], /option A/);
      assert.deepStrictEqual(args[2], { thread_ts: "111.222" });
    });
  });

  describe("handleEvent (channel messages)", () => {
    it("should route threaded reply to correct context via responseCallback", async () => {
      provider._setChannelIdForTest("C_CHANNEL");

      // First create a thread so we have a cache entry
      const context: ChatContext = { projectId: "proj1", ticketId: "T-1" };
      const thread = await provider.createThread(context, "Test");
      const threadTs = (thread.metadata as any).thread_ts;

      // Set up response callback
      let callbackArgs: any[] = [];
      provider.setResponseCallback(async (providerId: string, ctx: ChatContext, answer: string) => {
        callbackArgs = [providerId, ctx, answer];
        return true;
      });

      // Simulate an incoming threaded reply in the channel
      await provider._handleEventForTest({
        type: "message",
        user: "U_USER",
        text: "my answer",
        channel: (thread.metadata as any).channel,
        channel_type: "channel",
        ts: "999.111",
        thread_ts: threadTs,
      });

      // Response callback should have been called with correct context
      assert.strictEqual(callbackArgs[0], "slack");
      assert.deepStrictEqual(callbackArgs[1], context);
      assert.strictEqual(callbackArgs[2], "my answer");
    });

    it("should ignore top-level messages without thread_ts", async () => {
      provider._setChannelIdForTest("C_CHANNEL");

      let callbackCalled = false;
      provider.setResponseCallback(async () => {
        callbackCalled = true;
        return true;
      });

      await provider._handleEventForTest({
        type: "message",
        user: "U_USER",
        text: "hello channel",
        channel: "C_CHANNEL",
        channel_type: "channel",
        ts: "999.000",
      });

      assert.strictEqual(callbackCalled, false);
    });
  });
});
