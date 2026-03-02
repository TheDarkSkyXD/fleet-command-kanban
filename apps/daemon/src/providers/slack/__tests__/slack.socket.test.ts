import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Track calls to mock SocketModeClient
let mockClientInstance: any;

// Mock @slack/socket-mode before importing SlackSocket
mock.module("@slack/socket-mode", {
  namedExports: {
    SocketModeClient: function (opts: any) {
      mockClientInstance = {
        appToken: opts.appToken,
        on: mock.fn(function (this: any, event: string, handler: Function) {
          this._messageHandler = handler;
        }),
        start: mock.fn(async function (this: any) {}),
        disconnect: mock.fn(async function (this: any) {}),
        _messageHandler: undefined,
      };
      return mockClientInstance;
    },
  },
});

// Now import SlackSocket after mocking dependencies
const { SlackSocket } = await import("../slack.socket.js");

describe("SlackSocket", () => {
  let onMessage: any;
  let socket: InstanceType<typeof SlackSocket>;

  beforeEach(() => {
    mockClientInstance = null;
    onMessage = mock.fn(async () => {});
  });

  function createSlackSocket() {
    return new SlackSocket("xapp-test-token", onMessage);
  }

  function simulateMessageEvent(event: any) {
    const ack = mock.fn(async () => {});
    const listener = mockClientInstance._messageHandler;

    if (!listener) {
      throw new Error("No message listener registered");
    }

    // Return promise that listener returns
    return listener.call(undefined, { event, ack });
  }

  describe("constructor", () => {
    it("should create a SocketModeClient with the app token", () => {
      socket = createSlackSocket();

      assert.ok(mockClientInstance);
      assert.strictEqual(mockClientInstance.appToken, "xapp-test-token");
    });

    it("should register a message event listener", () => {
      socket = createSlackSocket();

      assert.ok(mockClientInstance._messageHandler, "message listener should be registered");
    });
  });

  describe("message filtering", () => {
    beforeEach(() => {
      socket = createSlackSocket();
    });

    it("should ignore messages from bots", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "bot message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
        bot_id: "B_BOT",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(
        onMessage.mock.calls.length,
        0,
        "onMessage should not be called for bot messages"
      );
    });

    it("should ignore message subtypes (edits, deletes)", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "edited message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
        subtype: "message_changed",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(
        onMessage.mock.calls.length,
        0,
        "onMessage should not be called for message subtypes"
      );
    });

    it("should ignore non-DM messages (channel type not 'im')", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "channel message",
        channel: "C_CHANNEL",
        channel_type: "channel",
        ts: "123.456",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(
        onMessage.mock.calls.length,
        0,
        "onMessage should not be called for non-DM messages"
      );
    });

    it("should ignore messages without text", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(
        onMessage.mock.calls.length,
        0,
        "onMessage should not be called for messages without text"
      );
    });

    it("should ignore messages without user", async () => {
      const event = {
        type: "message",
        user: "",
        text: "message text",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(
        onMessage.mock.calls.length,
        0,
        "onMessage should not be called for messages without user"
      );
    });
  });

  describe("valid message handling", () => {
    beforeEach(() => {
      socket = createSlackSocket();
    });

    it("should call onMessage for valid DM messages", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "hello",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
      };

      await simulateMessageEvent(event);

      assert.strictEqual(onMessage.mock.calls.length, 1, "onMessage should be called once");
      assert.deepStrictEqual(onMessage.mock.calls[0].arguments[0], event);
    });

    it("should pass correct SlackMessageEvent to callback", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "test message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
        thread_ts: "111.222",
      };

      await simulateMessageEvent(event);

      const passedEvent = onMessage.mock.calls[0].arguments[0];
      assert.strictEqual(passedEvent.user, "U_USER");
      assert.strictEqual(passedEvent.text, "test message");
      assert.strictEqual(passedEvent.channel, "D_CHANNEL");
      assert.strictEqual(passedEvent.thread_ts, "111.222");
    });

    it("should include optional fields when present", async () => {
      const event = {
        type: "message",
        user: "U_USER",
        text: "message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
        thread_ts: "111.222",
      };

      await simulateMessageEvent(event);

      const passedEvent = onMessage.mock.calls[0].arguments[0];
      assert.strictEqual(passedEvent.thread_ts, "111.222");
    });
  });

  describe("acknowledgment handling", () => {
    beforeEach(() => {
      socket = createSlackSocket();
    });

    it("should acknowledge event immediately before processing", async () => {
      const ackMock = mock.fn(async () => {});
      const listener = mockClientInstance._messageHandler;

      const event = {
        type: "message",
        user: "U_USER",
        text: "message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
      };

      await listener({ event, ack: ackMock });

      assert.strictEqual(ackMock.mock.calls.length, 1, "ack should be called once");
    });

    it("should handle ack errors gracefully and skip message processing", async () => {
      const ackError = new Error("Ack failed");
      const ackMock = mock.fn(async () => {
        throw ackError;
      });

      const listener = mockClientInstance._messageHandler;

      const event = {
        type: "message",
        user: "U_USER",
        text: "message",
        channel: "D_CHANNEL",
        channel_type: "im",
        ts: "123.456",
      };

      const originalError = console.error;
      const errorCalls: any[] = [];
      console.error = mock.fn((...args: any[]) => {
        errorCalls.push(args);
      }) as any;

      try {
        await listener({ event, ack: ackMock });

        // onMessage should NOT have been called when ack fails
        assert.strictEqual(
          onMessage.mock.calls.length,
          0,
          "onMessage should not be called when ack fails"
        );

        // Error should have been logged
        assert.ok(
          errorCalls.some((call) =>
            call.some((arg: any) => String(arg).includes("Failed to acknowledge"))
          ),
          "Error about ack failure should be logged"
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe("error handling in onMessage callback", () => {
    beforeEach(() => {
      const callbackError = new Error("Callback error");
      onMessage = mock.fn(async () => {
        throw callbackError;
      });
      socket = createSlackSocket();
    });

    it("should catch and log errors from onMessage callback", async () => {
      const originalError = console.error;
      const errorCalls: any[] = [];
      console.error = mock.fn((...args: any[]) => {
        errorCalls.push(args);
      }) as any;

      try {
        const event = {
          type: "message",
          user: "U_USER",
          text: "message",
          channel: "D_CHANNEL",
          channel_type: "im",
          ts: "123.456",
        };

        await simulateMessageEvent(event);

        // onMessage should have been called
        assert.strictEqual(onMessage.mock.calls.length, 1);

        // Error should have been logged
        assert.ok(
          errorCalls.some((call) =>
            call.some((arg: any) => String(arg).includes("Error handling message"))
          ),
          "Error about message handling should be logged"
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe("connection lifecycle", () => {
    it("should connect to Socket Mode via client.start()", async () => {
      socket = createSlackSocket();
      await socket.connect();

      assert.strictEqual(
        mockClientInstance.start.mock.calls.length,
        1,
        "client.start should be called"
      );
    });

    it("should disconnect gracefully via client.disconnect()", async () => {
      socket = createSlackSocket();
      await socket.disconnect();

      assert.strictEqual(
        mockClientInstance.disconnect.mock.calls.length,
        1,
        "client.disconnect should be called"
      );
    });
  });
});
