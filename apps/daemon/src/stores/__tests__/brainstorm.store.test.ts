import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createBrainstormStore, BrainstormStore } from "../brainstorm.store.js";

describe("BrainstormStore", () => {
  let db: Database.Database;
  let store: BrainstormStore;
  let testDbPath: string;
  let projectId: string;

  before(() => {
    testDbPath = path.join(os.tmpdir(), `fc-brainstorm-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);

    const projectStore = createProjectStore(db);
    const project = projectStore.createProject({
      displayName: "Test Project",
      path: "/test/project",
    });
    projectId = project.id;

    store = createBrainstormStore(db);
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
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM conversation_messages").run();
    db.prepare("DELETE FROM brainstorms").run();
    db.prepare("DELETE FROM conversations").run();
  });

  describe("createBrainstorm", () => {
    it("should create a brainstorm with generated ID", () => {
      const brainstorm = store.createBrainstorm(projectId);

      assert.ok(brainstorm.id);
      assert.ok(brainstorm.id.startsWith("brain_"));
      assert.strictEqual(brainstorm.projectId, projectId);
      assert.strictEqual(brainstorm.status, "active");
      assert.ok(brainstorm.createdAt);
      assert.ok(brainstorm.updatedAt);
    });

    it("should auto-generate name with timestamp", () => {
      const brainstorm = store.createBrainstorm(projectId);

      assert.ok(brainstorm.name);
      assert.ok(brainstorm.name.startsWith("Brainstorm "));
    });

    it("should use custom name when provided", () => {
      const brainstorm = store.createBrainstorm(projectId, {
        name: "My Custom Brainstorm",
      });

      assert.strictEqual(brainstorm.name, "My Custom Brainstorm");
    });

    it("should create associated conversation", () => {
      const brainstorm = store.createBrainstorm(projectId);

      assert.ok(brainstorm.conversationId);
    });

    it("should have null createdTicketId initially", () => {
      const brainstorm = store.createBrainstorm(projectId);

      assert.strictEqual(brainstorm.createdTicketId, null);
    });
  });

  describe("getBrainstorm", () => {
    it("should return null for non-existent brainstorm", () => {
      const brainstorm = store.getBrainstorm("non-existent");
      assert.strictEqual(brainstorm, null);
    });

    it("should return brainstorm by ID", () => {
      const created = store.createBrainstorm(projectId);
      const brainstorm = store.getBrainstorm(created.id);

      assert.ok(brainstorm);
      assert.strictEqual(brainstorm.id, created.id);
    });
  });

  describe("getBrainstormByProject", () => {
    it("should return null for wrong project", () => {
      const created = store.createBrainstorm(projectId);
      const brainstorm = store.getBrainstormByProject("wrong-project", created.id);

      assert.strictEqual(brainstorm, null);
    });

    it("should return brainstorm for correct project", () => {
      const created = store.createBrainstorm(projectId);
      const brainstorm = store.getBrainstormByProject(projectId, created.id);

      assert.ok(brainstorm);
      assert.strictEqual(brainstorm.id, created.id);
    });
  });

  describe("listBrainstorms", () => {
    it("should return empty array when no brainstorms", () => {
      const brainstorms = store.listBrainstorms(projectId);
      assert.deepStrictEqual(brainstorms, []);
    });

    it("should return brainstorms for project", () => {
      store.createBrainstorm(projectId, { name: "First" });
      store.createBrainstorm(projectId, { name: "Second" });

      const brainstorms = store.listBrainstorms(projectId);

      assert.strictEqual(brainstorms.length, 2);
    });

    it("should sort by updated_at descending", () => {
      const first = store.createBrainstorm(projectId, { name: "First" });
      store.createBrainstorm(projectId, { name: "Second" });

      // Update first to make it most recent
      store.updateBrainstorm(first.id, { name: "First Updated" });

      const brainstorms = store.listBrainstorms(projectId);

      assert.strictEqual(brainstorms[0].name, "First Updated");
    });

    it("should not return brainstorms from other projects", () => {
      store.createBrainstorm(projectId);

      const brainstorms = store.listBrainstorms("other-project");

      assert.deepStrictEqual(brainstorms, []);
    });
  });

  describe("updateBrainstorm", () => {
    it("should update name", () => {
      const created = store.createBrainstorm(projectId);

      const updated = store.updateBrainstorm(created.id, {
        name: "New Name",
      });

      assert.ok(updated);
      assert.strictEqual(updated.name, "New Name");
    });

    it("should update status", () => {
      const created = store.createBrainstorm(projectId);

      const updated = store.updateBrainstorm(created.id, {
        status: "completed",
      });

      assert.ok(updated);
      assert.strictEqual(updated.status, "completed");
    });

    it("should update createdTicketId", () => {
      const created = store.createBrainstorm(projectId);

      const updated = store.updateBrainstorm(created.id, {
        createdTicketId: "TES-1",
      });

      assert.ok(updated);
      assert.strictEqual(updated.createdTicketId, "TES-1");
    });

    it("should update updatedAt timestamp", () => {
      const created = store.createBrainstorm(projectId);
      const originalUpdatedAt = created.updatedAt;

      const updated = store.updateBrainstorm(created.id, { name: "Updated" });

      assert.ok(updated);
      assert.ok(updated.updatedAt >= originalUpdatedAt);
    });

    it("should return null for non-existent brainstorm", () => {
      const result = store.updateBrainstorm("non-existent", { name: "Test" });
      assert.strictEqual(result, null);
    });
  });

  describe("deleteBrainstorm", () => {
    it("should delete existing brainstorm", () => {
      const created = store.createBrainstorm(projectId);

      const deleted = store.deleteBrainstorm(created.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(store.getBrainstorm(created.id), null);
    });

    it("should return false for non-existent brainstorm", () => {
      const deleted = store.deleteBrainstorm("non-existent");
      assert.strictEqual(deleted, false);
    });
  });
});
