import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createTicketStore, TicketStore } from "../ticket.store.js";
import { createBrainstormStore, BrainstormStore } from "../brainstorm.store.js";
import {
  createProviderChannelStore,
  ProviderChannelStore,
} from "../provider-channel.store.js";

describe("ProviderChannelStore", () => {
  let db: Database.Database;
  let channelStore: ProviderChannelStore;
  let ticketStore: TicketStore;
  let brainstormStore: BrainstormStore;
  let testDbPath: string;
  let projectId: string;
  let ticketId: string;
  let brainstormId: string;

  before(() => {
    testDbPath = path.join(
      os.tmpdir(),
      `fc-channel-test-${Date.now()}.db`
    );
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);

    const projectStore = createProjectStore(db);
    const project = projectStore.createProject({
      displayName: "Test Project",
      path: "/test/project",
    });
    projectId = project.id;

    ticketStore = createTicketStore(db);
    brainstormStore = createBrainstormStore(db);
    channelStore = createProviderChannelStore(db);
  });

  after(() => {
    db.close();
    try {
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(testDbPath + "-wal");
      fs.unlinkSync(testDbPath + "-shm");
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Order matters due to foreign key constraints
    db.prepare("DELETE FROM provider_channels").run();
    db.prepare("DELETE FROM task_comments").run();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM brainstorms").run();
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();

    // Create a fresh ticket and brainstorm for each test
    const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });
    ticketId = ticket.id;

    const brainstorm = brainstormStore.createBrainstorm(projectId, { name: "Test Brainstorm" });
    brainstormId = brainstorm.id;
  });

  describe("createChannel", () => {
    it("should create channel with ticketId", () => {
      const channel = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      assert.ok(channel.id);
      assert.match(channel.id, /^[0-9a-f-]{36}$/i);
      assert.strictEqual(channel.ticketId, ticketId);
      assert.strictEqual(channel.brainstormId, undefined);
      assert.strictEqual(channel.providerId, "telegram");
      assert.strictEqual(channel.channelId, "chat123");
      assert.ok(channel.createdAt);
    });

    it("should create channel with brainstormId", () => {
      const channel = channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat456",
      });

      assert.ok(channel.id);
      assert.strictEqual(channel.ticketId, undefined);
      assert.strictEqual(channel.brainstormId, brainstormId);
      assert.strictEqual(channel.providerId, "telegram");
      assert.strictEqual(channel.channelId, "chat456");
    });

    it("should store metadata as JSON", () => {
      const metadata = {
        messageThreadId: 12345,
        topicName: "Test Topic",
      };

      const channel = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat789",
        metadata,
      });

      assert.deepStrictEqual(channel.metadata, metadata);
    });

    it("should enforce mutual exclusivity - cannot have both ticketId and brainstormId", () => {
      assert.throws(
        () => {
          channelStore.createChannel({
            ticketId,
            brainstormId,
            providerId: "telegram",
            channelId: "chat999",
          });
        },
        /CHECK constraint failed/
      );
    });

    it("should enforce mutual exclusivity - must have either ticketId or brainstormId", () => {
      assert.throws(
        () => {
          channelStore.createChannel({
            providerId: "telegram",
            channelId: "chat999",
          });
        },
        /CHECK constraint failed/
      );
    });

    it("should enforce unique ticket + provider combination", () => {
      channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat1",
      });

      assert.throws(
        () => {
          channelStore.createChannel({
            ticketId,
            providerId: "telegram",
            channelId: "chat2",
          });
        },
        /UNIQUE constraint failed/
      );
    });

    it("should allow same ticket with different providers", () => {
      const channel1 = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat1",
      });

      const channel2 = channelStore.createChannel({
        ticketId,
        providerId: "slack",
        channelId: "channel1",
      });

      assert.notStrictEqual(channel1.id, channel2.id);
      assert.strictEqual(channel1.ticketId, channel2.ticketId);
    });

    it("should enforce unique brainstorm + provider combination", () => {
      channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat1",
      });

      assert.throws(
        () => {
          channelStore.createChannel({
            brainstormId,
            providerId: "telegram",
            channelId: "chat2",
          });
        },
        /UNIQUE constraint failed/
      );
    });
  });

  describe("getChannel", () => {
    it("should return null for non-existent channel", () => {
      const channel = channelStore.getChannel("non-existent-uuid");
      assert.strictEqual(channel, null);
    });

    it("should return channel by id", () => {
      const created = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      const channel = channelStore.getChannel(created.id);

      assert.ok(channel);
      assert.strictEqual(channel.id, created.id);
      assert.strictEqual(channel.ticketId, ticketId);
      assert.strictEqual(channel.providerId, "telegram");
    });
  });

  describe("getChannelForTicket", () => {
    it("should return null if no channel exists for ticket + provider", () => {
      const channel = channelStore.getChannelForTicket(ticketId, "telegram");
      assert.strictEqual(channel, null);
    });

    it("should return channel for ticket and provider", () => {
      const created = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      const channel = channelStore.getChannelForTicket(ticketId, "telegram");

      assert.ok(channel);
      assert.strictEqual(channel.id, created.id);
      assert.strictEqual(channel.channelId, "chat123");
    });

    it("should only return matching provider", () => {
      channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      const channel = channelStore.getChannelForTicket(ticketId, "slack");
      assert.strictEqual(channel, null);
    });
  });

  describe("getChannelForBrainstorm", () => {
    it("should return null if no channel exists for brainstorm + provider", () => {
      const channel = channelStore.getChannelForBrainstorm(brainstormId, "telegram");
      assert.strictEqual(channel, null);
    });

    it("should return channel for brainstorm and provider", () => {
      const created = channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat456",
      });

      const channel = channelStore.getChannelForBrainstorm(brainstormId, "telegram");

      assert.ok(channel);
      assert.strictEqual(channel.id, created.id);
      assert.strictEqual(channel.channelId, "chat456");
    });
  });

  describe("findChannelByProviderChannel", () => {
    it("should return null if no matching provider + channelId", () => {
      const channel = channelStore.findChannelByProviderChannel(
        "telegram",
        "nonexistent"
      );
      assert.strictEqual(channel, null);
    });

    it("should find channel by provider and channelId (reverse lookup)", () => {
      const created = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      const channel = channelStore.findChannelByProviderChannel(
        "telegram",
        "chat123"
      );

      assert.ok(channel);
      assert.strictEqual(channel.id, created.id);
      assert.strictEqual(channel.ticketId, ticketId);
    });

    it("should find brainstorm channel by provider and channelId", () => {
      const created = channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat456",
      });

      const channel = channelStore.findChannelByProviderChannel(
        "telegram",
        "chat456"
      );

      assert.ok(channel);
      assert.strictEqual(channel.brainstormId, brainstormId);
    });
  });

  describe("listChannels", () => {
    it("should return empty array when no channels exist", () => {
      const channels = channelStore.listChannels();
      assert.deepStrictEqual(channels, []);
    });

    it("should return all channels when no filter provided", () => {
      channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat1",
      });
      channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat2",
      });

      const channels = channelStore.listChannels();

      assert.strictEqual(channels.length, 2);
    });

    it("should filter by ticketId", () => {
      channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat1",
      });
      channelStore.createChannel({
        ticketId,
        providerId: "slack",
        channelId: "channel1",
      });
      channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat2",
      });

      const channels = channelStore.listChannels({ ticketId });

      assert.strictEqual(channels.length, 2);
      assert.ok(channels.every((c) => c.ticketId === ticketId));
    });

    it("should filter by brainstormId", () => {
      channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat1",
      });
      channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat2",
      });

      const channels = channelStore.listChannels({ brainstormId });

      assert.strictEqual(channels.length, 1);
      assert.strictEqual(channels[0].brainstormId, brainstormId);
    });
  });

  describe("deleteChannel", () => {
    it("should delete channel and return true", () => {
      const created = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      const deleted = channelStore.deleteChannel(created.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(channelStore.getChannel(created.id), null);
    });

    it("should return false for non-existent channel", () => {
      const deleted = channelStore.deleteChannel("non-existent");
      assert.strictEqual(deleted, false);
    });
  });

  describe("cascade delete", () => {
    it("should delete channels when ticket is deleted", () => {
      const channel = channelStore.createChannel({
        ticketId,
        providerId: "telegram",
        channelId: "chat123",
      });

      // Delete the ticket
      ticketStore.deleteTicket(projectId, ticketId);

      // Channel should be gone
      assert.strictEqual(channelStore.getChannel(channel.id), null);
    });

    it("should delete channels when brainstorm is deleted", () => {
      const channel = channelStore.createChannel({
        brainstormId,
        providerId: "telegram",
        channelId: "chat123",
      });

      // Delete the brainstorm
      brainstormStore.deleteBrainstorm(brainstormId);

      // Channel should be gone
      assert.strictEqual(channelStore.getChannel(channel.id), null);
    });
  });
});
