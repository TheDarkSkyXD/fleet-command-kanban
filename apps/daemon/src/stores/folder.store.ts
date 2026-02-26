import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDatabase } from "./db.js";
import type { Folder } from "@potato-cannon/shared";

/**
 * Map a database row to a Folder object.
 */
function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Folder store with dependency injection for the database.
 */
export class FolderStore {
  constructor(private db: Database.Database) {}

  /**
   * Get all folders, ordered alphabetically by name.
   */
  getAllFolders(): Folder[] {
    const rows = this.db.prepare("SELECT * FROM folders ORDER BY name").all();
    return rows.map((row) => rowToFolder(row as Record<string, unknown>));
  }

  /**
   * Get a folder by its ID.
   */
  getFolderById(id: string): Folder | null {
    const row = this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
    return row ? rowToFolder(row as Record<string, unknown>) : null;
  }

  /**
   * Create a new folder. Returns the created folder.
   * Throws if name is empty or whitespace-only.
   * Throws if name violates UNIQUE constraint.
   */
  createFolder(name: string): Folder {
    if (!name?.trim()) {
      throw new Error("Folder name cannot be empty");
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        INSERT INTO folders (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, name.trim(), now, now);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        throw new Error(`Folder with name "${name.trim()}" already exists`);
      }
      throw error;
    }

    return this.getFolderById(id)!;
  }

  /**
   * Rename a folder. Returns the updated folder, or null if not found.
   * Throws if name is empty or whitespace-only.
   * Throws if new name violates UNIQUE constraint.
   */
  renameFolder(id: string, name: string): Folder | null {
    if (!name?.trim()) {
      throw new Error("Folder name cannot be empty");
    }

    const existing = this.getFolderById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        UPDATE folders SET name = ?, updated_at = ? WHERE id = ?
      `).run(name.trim(), now, id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        throw new Error(`Folder with name "${name.trim()}" already exists`);
      }
      throw error;
    }

    return this.getFolderById(id);
  }

  /**
   * Delete a folder. Returns true if deleted, false if not found.
   * Throws if folder still has projects assigned.
   */
  deleteFolder(id: string): boolean {
    const count = this.getFolderProjectCount(id);
    if (count > 0) {
      throw new Error("Cannot delete folder that contains projects");
    }

    const result = this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Get the number of projects in a folder.
   */
  getFolderProjectCount(id: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE folder_id = ?")
      .get(id) as { count: number };
    return row.count;
  }
}

/**
 * Create a folder store with a custom database instance.
 * Useful for testing.
 */
export function createFolderStore(db: Database.Database): FolderStore {
  return new FolderStore(db);
}

// ============================================================================
// Convenience functions that use the singleton database
// ============================================================================

export function getAllFolders(): Folder[] {
  return new FolderStore(getDatabase()).getAllFolders();
}

export function getFolderById(id: string): Folder | null {
  return new FolderStore(getDatabase()).getFolderById(id);
}

export function createFolder(name: string): Folder {
  return new FolderStore(getDatabase()).createFolder(name);
}

export function renameFolder(id: string, name: string): Folder | null {
  return new FolderStore(getDatabase()).renameFolder(id, name);
}

export function deleteFolder(id: string): boolean {
  return new FolderStore(getDatabase()).deleteFolder(id);
}

export function getFolderProjectCount(id: string): number {
  return new FolderStore(getDatabase()).getFolderProjectCount(id);
}
