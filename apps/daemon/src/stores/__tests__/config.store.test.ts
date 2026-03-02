import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createConfigStore, ConfigStore } from "../config.store.js";

describe("ConfigStore", () => {
  let db: Database.Database;
  let configStore: ConfigStore;
  let testDbPath: string;

  before(() => {
    testDbPath = path.join(os.tmpdir(), `potato-config-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);

    configStore = createConfigStore(db);
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
    db.prepare("DELETE FROM config").run();
  });

  describe("get/set", () => {
    it("should return null for non-existent key", () => {
      const value = configStore.get("non-existent-key");
      assert.strictEqual(value, null);
    });

    it("should set and get a string value", () => {
      configStore.set("my-string", "hello world");
      const value = configStore.get<string>("my-string");
      assert.strictEqual(value, "hello world");
    });

    it("should set and get a number value", () => {
      configStore.set("my-number", 42);
      const value = configStore.get<number>("my-number");
      assert.strictEqual(value, 42);
    });

    it("should set and get a boolean value", () => {
      configStore.set("my-bool", true);
      const value = configStore.get<boolean>("my-bool");
      assert.strictEqual(value, true);
    });

    it("should set and get an object value", () => {
      const obj = { name: "test", count: 5, nested: { deep: true } };
      configStore.set("my-object", obj);
      const value = configStore.get<typeof obj>("my-object");
      assert.deepStrictEqual(value, obj);
    });

    it("should set and get an array value", () => {
      const arr = [1, "two", { three: 3 }];
      configStore.set("my-array", arr);
      const value = configStore.get<typeof arr>("my-array");
      assert.deepStrictEqual(value, arr);
    });

    it("should overwrite existing value", () => {
      configStore.set("overwrite-key", "first");
      configStore.set("overwrite-key", "second");
      const value = configStore.get<string>("overwrite-key");
      assert.strictEqual(value, "second");
    });

    it("should handle null value", () => {
      configStore.set("null-key", null);
      const value = configStore.get("null-key");
      assert.strictEqual(value, null);
    });
  });

  describe("delete", () => {
    it("should delete existing key", () => {
      configStore.set("to-delete", "value");
      const result = configStore.delete("to-delete");
      assert.strictEqual(result, true);
      assert.strictEqual(configStore.get("to-delete"), null);
    });

    it("should return false for non-existent key", () => {
      const result = configStore.delete("non-existent");
      assert.strictEqual(result, false);
    });
  });

  describe("getAll", () => {
    it("should return empty object when no config", () => {
      const all = configStore.getAll();
      assert.deepStrictEqual(all, {});
    });

    it("should return all config entries", () => {
      configStore.set("key1", "value1");
      configStore.set("key2", 42);
      configStore.set("key3", { nested: true });

      const all = configStore.getAll();

      assert.deepStrictEqual(all, {
        key1: "value1",
        key2: 42,
        key3: { nested: true },
      });
    });
  });

  describe("getTelegramConfig", () => {
    it("should return null when not set", () => {
      const config = configStore.getTelegramConfig();
      assert.strictEqual(config, null);
    });

    it("should return telegram config when set", () => {
      const telegramConfig = {
        botToken: "123:ABC",
        userId: "12345",
        forumGroupId: "67890",
        mode: "polling" as const,
      };
      configStore.setTelegramConfig(telegramConfig);

      const config = configStore.getTelegramConfig();

      assert.deepStrictEqual(config, telegramConfig);
    });
  });

  describe("setTelegramConfig", () => {
    it("should store telegram config", () => {
      const telegramConfig = {
        botToken: "token123",
        userId: "user456",
        mode: "auto" as const,
      };
      configStore.setTelegramConfig(telegramConfig);

      const stored = configStore.get("telegram");
      assert.deepStrictEqual(stored, telegramConfig);
    });

    it("should overwrite existing telegram config", () => {
      configStore.setTelegramConfig({
        botToken: "old",
        userId: "old",
        mode: "polling",
      });
      configStore.setTelegramConfig({
        botToken: "new",
        userId: "new",
        mode: "webhook",
      });

      const config = configStore.getTelegramConfig();
      assert.strictEqual(config?.botToken, "new");
      assert.strictEqual(config?.mode, "webhook");
    });
  });

  describe("getDaemonConfig", () => {
    it("should return null when not set", () => {
      const config = configStore.getDaemonConfig();
      assert.strictEqual(config, null);
    });

    it("should return daemon config when set", () => {
      const daemonConfig = { port: 8080 };
      configStore.setDaemonConfig(daemonConfig);

      const config = configStore.getDaemonConfig();

      assert.deepStrictEqual(config, daemonConfig);
    });
  });

  describe("setDaemonConfig", () => {
    it("should store daemon config", () => {
      const daemonConfig = { port: 9000 };
      configStore.setDaemonConfig(daemonConfig);

      const stored = configStore.get("daemon");
      assert.deepStrictEqual(stored, daemonConfig);
    });
  });

  describe("getSlackConfig", () => {
    it("should return null when not set", () => {
      const config = configStore.getSlackConfig();
      assert.strictEqual(config, null);
    });

    it("should return slack config when set", () => {
      const slackConfig = {
        appToken: "xapp-1-A0123-1234567890-abc",
        botToken: "xoxb-1234567890-abc",
      };
      configStore.setSlackConfig(slackConfig);

      const config = configStore.getSlackConfig();

      assert.deepStrictEqual(config, slackConfig);
    });
  });

  describe("setSlackConfig", () => {
    it("should store slack config", () => {
      const slackConfig = {
        appToken: "xapp-test",
        botToken: "xoxb-test",
      };
      configStore.setSlackConfig(slackConfig);

      const stored = configStore.get("slack");
      assert.deepStrictEqual(stored, slackConfig);
    });

    it("should overwrite existing slack config", () => {
      configStore.setSlackConfig({
        appToken: "xapp-old",
        botToken: "xoxb-old",
      });
      configStore.setSlackConfig({
        appToken: "xapp-new",
        botToken: "xoxb-new",
      });

      const config = configStore.getSlackConfig();
      assert.strictEqual(config?.appToken, "xapp-new");
      assert.strictEqual(config?.botToken, "xoxb-new");
    });
  });
});
