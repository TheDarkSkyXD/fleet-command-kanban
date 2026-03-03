import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

let mockConversations: any[];

mock.module("@slack/web-api", {
  namedExports: {
    WebClient: function () {
      return {
        auth: { test: async () => ({ user_id: "U_BOT" }) },
        users: {
          conversations: async () => ({ channels: mockConversations }),
        },
      };
    },
  },
});

const { SlackApi } = await import("../slack.api.js");

describe("SlackApi.discoverChannel", () => {
  let api: InstanceType<typeof SlackApi>;

  beforeEach(() => {
    mockConversations = [];
    api = new SlackApi("xoxb-test-token");
  });

  it("should return null when only is_general channels exist", async () => {
    mockConversations = [{ id: "C_GEN", name: "general", is_general: true }];
    assert.strictEqual(await api.discoverChannel(), null);
  });

  it("should return non-general channel when available", async () => {
    mockConversations = [
      { id: "C_GEN", name: "general", is_general: true },
      { id: "C_DEV", name: "dev", is_general: false },
    ];
    assert.deepStrictEqual(await api.discoverChannel(), {
      id: "C_DEV",
      name: "dev",
    });
  });

  it("should return null when bot has no channels", async () => {
    mockConversations = [];
    assert.strictEqual(await api.discoverChannel(), null);
  });

  it("should return first non-general channel when multiple exist", async () => {
    mockConversations = [
      { id: "C_GEN", name: "general", is_general: true },
      { id: "C_ONE", name: "one", is_general: false },
      { id: "C_TWO", name: "two", is_general: false },
    ];
    assert.deepStrictEqual(await api.discoverChannel(), {
      id: "C_ONE",
      name: "one",
    });
  });
});
