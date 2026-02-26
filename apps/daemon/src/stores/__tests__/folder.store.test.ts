import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createFolderStore, FolderStore } from "../folder.store.js";

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("FolderStore", () => {
  let db: Database.Database;
  let store: FolderStore;
  let testDbPath: string;

  before(() => {
    // Create a temp database for integration tests
    testDbPath = path.join(os.tmpdir(), `potato-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);
    store = createFolderStore(db);
  });

  after(() => {
    db.close();
    // Clean up temp files
    try {
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(testDbPath + "-wal");
      fs.unlinkSync(testDbPath + "-shm");
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Clear folders table before each test
    db.prepare("DELETE FROM folders").run();
  });

  describe("createFolder", () => {
    it("should create a folder with auto-generated UUID and timestamps", () => {
      const folder = store.createFolder("My Folder");

      assert.match(folder.id, UUID_REGEX, "ID should be a valid UUID");
      assert.strictEqual(folder.name, "My Folder");
      assert.ok(folder.createdAt);
      assert.ok(folder.updatedAt);
      assert.strictEqual(folder.createdAt, folder.updatedAt);
    });

    it("should trim folder name on creation", () => {
      const folder = store.createFolder("  My Folder  ");

      assert.strictEqual(folder.name, "My Folder");
    });

    it("should reject empty folder names", () => {
      assert.throws(
        () => store.createFolder(""),
        (error: Error) => error.message === "Folder name cannot be empty"
      );
    });

    it("should reject whitespace-only folder names", () => {
      assert.throws(
        () => store.createFolder("   "),
        (error: Error) => error.message === "Folder name cannot be empty"
      );
    });

    it("should reject null or undefined folder names", () => {
      assert.throws(
        () => store.createFolder(null as any),
        (error: Error) => error.message === "Folder name cannot be empty"
      );
    });

    it("should throw on duplicate folder name (UNIQUE constraint)", () => {
      store.createFolder("Unique Folder");

      assert.throws(
        () => store.createFolder("Unique Folder"),
        (error: Error) =>
          error.message.includes("Folder with name") &&
          error.message.includes("already exists")
      );
    });

    it("should allow different case variants of same name (SQLite is case-sensitive)", () => {
      const folder1 = store.createFolder("MyFolder");
      const folder2 = store.createFolder("myfolder");

      assert.notStrictEqual(folder1.id, folder2.id);
      assert.strictEqual(folder1.name, "MyFolder");
      assert.strictEqual(folder2.name, "myfolder");
    });
  });

  describe("getFolderById", () => {
    it("should return null for non-existent folder", () => {
      const folder = store.getFolderById("non-existent");
      assert.strictEqual(folder, null);
    });

    it("should return folder by ID", () => {
      const created = store.createFolder("Test Folder");
      const folder = store.getFolderById(created.id);

      assert.ok(folder);
      assert.strictEqual(folder.id, created.id);
      assert.strictEqual(folder.name, "Test Folder");
    });

    it("should preserve timestamps", () => {
      const created = store.createFolder("Test Folder");
      const retrieved = store.getFolderById(created.id);

      assert.strictEqual(retrieved?.createdAt, created.createdAt);
      assert.strictEqual(retrieved?.updatedAt, created.updatedAt);
    });
  });

  describe("getAllFolders", () => {
    it("should return empty array when no folders exist", () => {
      const folders = store.getAllFolders();
      assert.deepStrictEqual(folders, []);
    });

    it("should return all folders sorted alphabetically by name", () => {
      store.createFolder("Zebra");
      store.createFolder("Apple");
      store.createFolder("Mango");

      const folders = store.getAllFolders();
      assert.strictEqual(folders.length, 3);
      assert.strictEqual(folders[0].name, "Apple");
      assert.strictEqual(folders[1].name, "Mango");
      assert.strictEqual(folders[2].name, "Zebra");
    });

    it("should return correct folder objects with all properties", () => {
      const created = store.createFolder("Test");
      const folders = store.getAllFolders();

      assert.strictEqual(folders.length, 1);
      const folder = folders[0];
      assert.strictEqual(folder.id, created.id);
      assert.strictEqual(folder.name, "Test");
      assert.ok(folder.createdAt);
      assert.ok(folder.updatedAt);
    });
  });

  describe("renameFolder", () => {
    it("should return null for non-existent folder", () => {
      const result = store.renameFolder("non-existent", "New Name");
      assert.strictEqual(result, null);
    });

    it("should rename existing folder", () => {
      const created = store.createFolder("Original Name");
      const updated = store.renameFolder(created.id, "New Name");

      assert.ok(updated);
      assert.strictEqual(updated.name, "New Name");
      assert.strictEqual(updated.id, created.id);

      // Verify persistence
      const folder = store.getFolderById(created.id);
      assert.strictEqual(folder?.name, "New Name");
    });

    it("should update updatedAt timestamp on rename", () => {
      const created = store.createFolder("Original");
      const beforeRename = created.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = store.renameFolder(created.id, "Renamed");

      assert.ok(updated);
      assert.strictEqual(updated.createdAt, beforeRename);
      assert.notStrictEqual(updated.updatedAt, beforeRename);
    });

    it("should trim folder name on rename", () => {
      const created = store.createFolder("Original");
      const updated = store.renameFolder(created.id, "  New Name  ");

      assert.strictEqual(updated?.name, "New Name");
    });

    it("should reject empty folder names on rename", () => {
      const created = store.createFolder("Original");

      assert.throws(
        () => store.renameFolder(created.id, ""),
        (error: Error) => error.message === "Folder name cannot be empty"
      );
    });

    it("should reject whitespace-only names on rename", () => {
      const created = store.createFolder("Original");

      assert.throws(
        () => store.renameFolder(created.id, "   "),
        (error: Error) => error.message === "Folder name cannot be empty"
      );
    });

    it("should throw on duplicate folder name during rename (UNIQUE constraint)", () => {
      const folder1 = store.createFolder("Folder A");
      const folder2 = store.createFolder("Folder B");

      assert.throws(
        () => store.renameFolder(folder2.id, "Folder A"),
        (error: Error) =>
          error.message.includes("Folder with name") &&
          error.message.includes("already exists")
      );

      // Verify folder2 was not changed
      const folder2After = store.getFolderById(folder2.id);
      assert.strictEqual(folder2After?.name, "Folder B");
    });
  });

  describe("deleteFolder", () => {
    it("should return false for non-existent folder", () => {
      const result = store.deleteFolder("non-existent");
      assert.strictEqual(result, false);
    });

    it("should delete existing folder", () => {
      const created = store.createFolder("To Delete");

      const deleted = store.deleteFolder(created.id);
      assert.strictEqual(deleted, true);

      const folder = store.getFolderById(created.id);
      assert.strictEqual(folder, null);
    });

    it("should throw when deleting folder with projects", () => {
      const folder = store.createFolder("Folder with Projects");

      // Create a project in this folder
      const projectId = "test-project-id";
      db.prepare(`
        INSERT INTO projects (
          id, display_name, slug, path, registered_at, folder_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        "Test Project",
        "test-project",
        "/path/to/project",
        new Date().toISOString(),
        folder.id
      );

      assert.throws(
        () => store.deleteFolder(folder.id),
        (error: Error) =>
          error.message === "Cannot delete folder that contains projects"
      );

      // Verify folder still exists
      const stillExists = store.getFolderById(folder.id);
      assert.ok(stillExists);
    });
  });

  describe("getFolderProjectCount", () => {
    it("should return 0 for folder with no projects", () => {
      const folder = store.createFolder("Empty Folder");
      const count = store.getFolderProjectCount(folder.id);

      assert.strictEqual(count, 0);
    });

    it("should return correct count for folder with projects", () => {
      const folder = store.createFolder("Folder with Projects");

      // Create multiple projects in this folder
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO projects (
            id, display_name, slug, path, registered_at, folder_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `project-${i}`,
          `Project ${i}`,
          `project-${i}`,
          `/path/to/project-${i}`,
          new Date().toISOString(),
          folder.id
        );
      }

      const count = store.getFolderProjectCount(folder.id);
      assert.strictEqual(count, 3);
    });

    it("should return 0 for non-existent folder", () => {
      const count = store.getFolderProjectCount("non-existent");
      assert.strictEqual(count, 0);
    });
  });
});
