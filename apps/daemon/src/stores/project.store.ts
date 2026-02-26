import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDatabase } from "./db.js";
import type { Project } from "../types/config.types.js";

export interface CreateProjectInput {
  displayName: string;
  path: string;
  icon?: string;
  color?: string;
  templateName?: string;
  templateVersion?: string;
}

/**
 * Generate a URL-safe slug from a display name.
 * Handles collisions by appending -2, -3, etc.
 */
export function generateSlug(displayName: string, existingSlugs: string[] = []): string {
  // Slugify: lowercase, replace non-alphanumeric with dashes, trim dashes
  let slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (!slug) {
    slug = "project";
  }

  // Handle collisions
  if (!existingSlugs.includes(slug)) {
    return slug;
  }

  let counter = 2;
  while (existingSlugs.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

/**
 * Map a database row to a Project object.
 */
function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    slug: row.slug as string,
    displayName: row.display_name as string,
    path: row.path as string,
    registeredAt: row.registered_at as string,
    icon: row.icon as string | undefined,
    color: row.color as string | undefined,
    template: row.template_name
      ? {
          name: row.template_name as string,
          version: row.template_version as string,
        }
      : undefined,
    disabledPhases: row.disabled_phases
      ? JSON.parse(row.disabled_phases as string)
      : undefined,
    disabledPhaseMigration: row.disabled_phase_migration === 1,
    swimlaneColors: row.swimlane_colors
      ? JSON.parse(row.swimlane_colors as string)
      : undefined,
    branchPrefix: (row.branch_prefix as string) || 'potato',
    folderId: (row.folder_id as string) || null,
  };
}

/**
 * Project store with dependency injection for the database.
 * Use createProjectStore() to create an instance with a custom database,
 * or use the exported functions which use the singleton database.
 */
export class ProjectStore {
  constructor(private db: Database.Database) {}

  /**
   * Get all existing slugs from the database.
   */
  private getExistingSlugs(): string[] {
    const rows = this.db.prepare("SELECT slug FROM projects").all() as { slug: string }[];
    return rows.map((r) => r.slug);
  }

  /**
   * Get all projects.
   */
  getAllProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY display_name").all();
    return rows.map((row) => rowToProject(row as Record<string, unknown>));
  }

  /**
   * Get all projects as a Map (for backward compatibility).
   */
  getAllProjectsMap(): Map<string, Project> {
    const projects = this.getAllProjects();
    return new Map(projects.map((p) => [p.id, p]));
  }

  /**
   * Get a project by its ID.
   */
  getProjectById(id: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? rowToProject(row as Record<string, unknown>) : null;
  }

  /**
   * Get a project by its slug.
   */
  getProjectBySlug(slug: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug);
    return row ? rowToProject(row as Record<string, unknown>) : null;
  }

  /**
   * Create a new project.
   */
  createProject(input: CreateProjectInput): Project {
    const id = randomUUID();
    const slug = generateSlug(input.displayName, this.getExistingSlugs());
    const registeredAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO projects (
        id, slug, display_name, path, registered_at,
        icon, color, template_name, template_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      slug,
      input.displayName,
      input.path,
      registeredAt,
      input.icon || null,
      input.color || null,
      input.templateName || null,
      input.templateVersion || null
    );

    return this.getProjectById(id)!;
  }

  /**
   * Update a project.
   */
  updateProject(
    id: string,
    updates: Partial<Omit<Project, "id" | "slug" | "registeredAt">>
  ): Project | null {
    const existing = this.getProjectById(id);
    if (!existing) {
      return null;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.displayName !== undefined) {
      fields.push("display_name = ?");
      values.push(updates.displayName);
    }
    if (updates.path !== undefined) {
      fields.push("path = ?");
      values.push(updates.path);
    }
    if (updates.icon !== undefined) {
      fields.push("icon = ?");
      values.push(updates.icon || null);
    }
    if (updates.color !== undefined) {
      fields.push("color = ?");
      values.push(updates.color || null);
    }
    if (updates.template !== undefined) {
      fields.push("template_name = ?", "template_version = ?");
      values.push(
        updates.template?.name || null,
        updates.template?.version || null
      );
    }
    if (updates.disabledPhases !== undefined) {
      fields.push("disabled_phases = ?");
      values.push(
        updates.disabledPhases ? JSON.stringify(updates.disabledPhases) : null
      );
    }
    if (updates.disabledPhaseMigration !== undefined) {
      fields.push("disabled_phase_migration = ?");
      values.push(updates.disabledPhaseMigration ? 1 : 0);
    }
    if (updates.swimlaneColors !== undefined) {
      fields.push("swimlane_colors = ?");
      values.push(
        updates.swimlaneColors ? JSON.stringify(updates.swimlaneColors) : null
      );
    }
    if (updates.branchPrefix !== undefined) {
      fields.push("branch_prefix = ?");
      values.push(updates.branchPrefix || null);
    }
    if (updates.folderId !== undefined) {
      fields.push("folder_id = ?");
      values.push(updates.folderId || null);
    }

    if (fields.length === 0) {
      return existing;
    }

    values.push(id);
    this.db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(
      ...values
    );

    return this.getProjectById(id);
  }

  /**
   * Update a project's template.
   */
  updateProjectTemplate(
    id: string,
    templateName: string,
    version: string
  ): Project | null {
    return this.updateProject(id, { template: { name: templateName, version } });
  }

  /**
   * Delete a project.
   */
  deleteProject(id: string): boolean {
    const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  }
}

/**
 * Create a project store with a custom database instance.
 * Useful for testing.
 */
export function createProjectStore(db: Database.Database): ProjectStore {
  return new ProjectStore(db);
}

// ============================================================================
// Convenience functions that use the singleton database
// These maintain backward compatibility with existing code
// ============================================================================

/**
 * Get all projects.
 */
export function getAllProjects(): Project[] {
  return new ProjectStore(getDatabase()).getAllProjects();
}

/**
 * Get all projects as a Map (for backward compatibility).
 */
export function getAllProjectsMap(): Map<string, Project> {
  return new ProjectStore(getDatabase()).getAllProjectsMap();
}

/**
 * Get a project by its ID.
 */
export function getProjectById(id: string): Project | null {
  return new ProjectStore(getDatabase()).getProjectById(id);
}

/**
 * Get a project by its slug.
 */
export function getProjectBySlug(slug: string): Project | null {
  return new ProjectStore(getDatabase()).getProjectBySlug(slug);
}

/**
 * Create a new project.
 */
export function createProject(input: CreateProjectInput): Project {
  return new ProjectStore(getDatabase()).createProject(input);
}

/**
 * Update a project.
 */
export function updateProject(
  id: string,
  updates: Partial<Omit<Project, "id" | "slug" | "registeredAt">>
): Project | null {
  return new ProjectStore(getDatabase()).updateProject(id, updates);
}

/**
 * Update a project's template.
 */
export function updateProjectTemplate(
  id: string,
  templateName: string,
  version: string
): Project | null {
  return new ProjectStore(getDatabase()).updateProjectTemplate(id, templateName, version);
}

/**
 * Delete a project.
 */
export function deleteProject(id: string): boolean {
  return new ProjectStore(getDatabase()).deleteProject(id);
}
