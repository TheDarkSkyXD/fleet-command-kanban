import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { generateSlug, createProjectStore, ProjectStore } from "../project.store.js";

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateSlug", () => {
  it("should slugify display name", () => {
    const slug = generateSlug("My Project Name");
    assert.strictEqual(slug, "my-project-name");
  });

  it("should handle simple names", () => {
    const slug = generateSlug("my-project");
    assert.strictEqual(slug, "my-project");
  });

  it("should remove special characters", () => {
    const slug = generateSlug("project@123!test");
    assert.strictEqual(slug, "project-123-test");
  });

  it("should handle collision with -2 suffix", () => {
    const slug = generateSlug("project", ["project"]);
    assert.strictEqual(slug, "project-2");
  });

  it("should handle multiple collisions", () => {
    const slug = generateSlug("project", ["project", "project-2", "project-3"]);
    assert.strictEqual(slug, "project-4");
  });

  it("should handle empty slug fallback", () => {
    const slug = generateSlug("@#$%");
    assert.strictEqual(slug, "project");
  });

  it("should trim leading/trailing dashes", () => {
    const slug = generateSlug("-my-project-");
    assert.strictEqual(slug, "my-project");
  });
});

describe("ProjectStore", () => {
  let db: Database.Database;
  let store: ProjectStore;
  let testDbPath: string;

  before(() => {
    // Create a temp database for integration tests
    testDbPath = path.join(os.tmpdir(), `fc-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);
    store = createProjectStore(db);
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
    // Clear projects table before each test
    db.prepare("DELETE FROM projects").run();
  });

  describe("createProject", () => {
    it("should create a project with auto-generated UUID and slug", () => {
      const project = store.createProject({
        displayName: "My Project",
        path: "/path/to/project",
      });

      assert.match(project.id, UUID_REGEX, "ID should be a valid UUID");
      assert.strictEqual(project.slug, "my-project");
      assert.strictEqual(project.displayName, "My Project");
      assert.strictEqual(project.path, "/path/to/project");
      assert.ok(project.registeredAt);
    });

    it("should handle slug collisions", () => {
      const project1 = store.createProject({
        displayName: "Project",
        path: "/path/1",
      });

      const project2 = store.createProject({
        displayName: "Project",
        path: "/path/2",
      });

      assert.strictEqual(project1.slug, "project");
      assert.strictEqual(project2.slug, "project-2");
    });

    it("should store template info", () => {
      const project = store.createProject({
        displayName: "Test",
        path: "/test",
        templateName: "product-development",
        templateVersion: "1.0.0",
      });

      assert.deepStrictEqual(project.template, {
        name: "product-development",
        version: "1.0.0",
      });
    });

    it("should store icon and color", () => {
      const project = store.createProject({
        displayName: "Styled",
        path: "/styled",
        icon: "rocket",
        color: "#ff5500",
      });

      assert.strictEqual(project.icon, "rocket");
      assert.strictEqual(project.color, "#ff5500");
    });
  });

  describe("getProjectById", () => {
    it("should return null for non-existent project", () => {
      const project = store.getProjectById("non-existent");
      assert.strictEqual(project, null);
    });

    it("should return project by UUID", () => {
      const created = store.createProject({
        displayName: "My Project",
        path: "/path",
      });

      const project = store.getProjectById(created.id);
      assert.ok(project);
      assert.strictEqual(project.id, created.id);
      assert.strictEqual(project.displayName, "My Project");
    });
  });

  describe("getProjectBySlug", () => {
    it("should return project by slug", () => {
      const created = store.createProject({
        displayName: "Cool Project",
        path: "/path",
      });

      const project = store.getProjectBySlug("cool-project");
      assert.ok(project);
      assert.strictEqual(project.id, created.id);
      assert.strictEqual(project.slug, "cool-project");
    });

    it("should return null for non-existent slug", () => {
      const project = store.getProjectBySlug("non-existent");
      assert.strictEqual(project, null);
    });
  });

  describe("getAllProjects", () => {
    it("should return empty array when no projects", () => {
      const projects = store.getAllProjects();
      assert.deepStrictEqual(projects, []);
    });

    it("should return all projects sorted by display name", () => {
      store.createProject({
        displayName: "Zebra",
        path: "/z",
      });
      store.createProject({
        displayName: "Apple",
        path: "/a",
      });
      store.createProject({
        displayName: "Mango",
        path: "/m",
      });

      const projects = store.getAllProjects();
      assert.strictEqual(projects.length, 3);
      assert.strictEqual(projects[0].displayName, "Apple");
      assert.strictEqual(projects[1].displayName, "Mango");
      assert.strictEqual(projects[2].displayName, "Zebra");
    });
  });

  describe("getAllProjectsMap", () => {
    it("should return projects as a Map keyed by ID", () => {
      const project1 = store.createProject({
        displayName: "Project 1",
        path: "/p1",
      });
      const project2 = store.createProject({
        displayName: "Project 2",
        path: "/p2",
      });

      const map = store.getAllProjectsMap();
      assert.strictEqual(map.size, 2);
      assert.ok(map.has(project1.id));
      assert.ok(map.has(project2.id));
      assert.strictEqual(map.get(project1.id)?.displayName, "Project 1");
    });
  });

  describe("updateProject", () => {
    it("should update display name", () => {
      const created = store.createProject({
        displayName: "Original",
        path: "/path",
      });

      const updated = store.updateProject(created.id, { displayName: "Updated" });

      assert.strictEqual(updated?.displayName, "Updated");

      // Verify persistence
      const project = store.getProjectById(created.id);
      assert.strictEqual(project?.displayName, "Updated");
    });

    it("should update template", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      store.updateProject(created.id, {
        template: { name: "new-template", version: "2.0.0" },
      });

      const project = store.getProjectById(created.id);
      assert.deepStrictEqual(project?.template, {
        name: "new-template",
        version: "2.0.0",
      });
    });

    it("should update automatedPhases as JSON", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      store.updateProject(created.id, {
        automatedPhases: ["Refinement", "Review"],
      });

      const project = store.getProjectById(created.id);
      assert.deepStrictEqual(project?.automatedPhases, ["Refinement", "Review"]);
    });

    it("should update swimlaneColors as JSON", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      store.updateProject(created.id, {
        swimlaneColors: { Ideas: "#ff0000", Done: "#00ff00" },
      });

      const project = store.getProjectById(created.id);
      assert.deepStrictEqual(project?.swimlaneColors, {
        Ideas: "#ff0000",
        Done: "#00ff00",
      });
    });

    it("should update icon and color", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      store.updateProject(created.id, {
        icon: "star",
        color: "#0000ff",
      });

      const project = store.getProjectById(created.id);
      assert.strictEqual(project?.icon, "star");
      assert.strictEqual(project?.color, "#0000ff");
    });

    it("should return null for non-existent project", () => {
      const result = store.updateProject("non-existent", { displayName: "Test" });
      assert.strictEqual(result, null);
    });

    it("should return existing project when no updates provided", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      const result = store.updateProject(created.id, {});
      assert.ok(result);
      assert.strictEqual(result.displayName, "Test");
    });

    it("should update branchPrefix", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      // Default should be 'fleet'
      assert.strictEqual(created.branchPrefix, "fleet");

      // Update to custom prefix
      const updated = store.updateProject(created.id, {
        branchPrefix: "custom",
      });

      assert.strictEqual(updated?.branchPrefix, "custom");

      // Verify persistence
      const project = store.getProjectById(created.id);
      assert.strictEqual(project?.branchPrefix, "custom");
    });

    it("should handle clearing branchPrefix to default", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      // Set to custom
      store.updateProject(created.id, { branchPrefix: "custom" });

      // Clear to null (should default to 'fleet' when read)
      const updated = store.updateProject(created.id, {
        branchPrefix: null as any,
      });

      assert.strictEqual(updated?.branchPrefix, "fleet");

      // Verify persistence
      const project = store.getProjectById(created.id);
      assert.strictEqual(project?.branchPrefix, "fleet");
    });
  });

  describe("updateProjectTemplate", () => {
    it("should update template name and version", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      store.updateProjectTemplate(created.id, "new-template", "3.0.0");

      const project = store.getProjectById(created.id);
      assert.deepStrictEqual(project?.template, {
        name: "new-template",
        version: "3.0.0",
      });
    });
  });

  describe("deleteProject", () => {
    it("should delete existing project", () => {
      const created = store.createProject({
        displayName: "Test",
        path: "/path",
      });

      const deleted = store.deleteProject(created.id);
      assert.strictEqual(deleted, true);

      const project = store.getProjectById(created.id);
      assert.strictEqual(project, null);
    });

    it("should return false for non-existent project", () => {
      const deleted = store.deleteProject("non-existent");
      assert.strictEqual(deleted, false);
    });
  });
});
