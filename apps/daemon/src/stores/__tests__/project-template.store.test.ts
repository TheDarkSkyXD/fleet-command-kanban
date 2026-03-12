import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("project-template.store", () => {
  describe("hasProjectAgentOverride", () => {
    let testProjectDir: string;
    const homeDir = os.homedir();
    const fleetDir = path.join(homeDir, ".fleet-command");
    const projectId = "test-override-check-" + Date.now();

    before(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId, "template", "agents");
      testProjectDir = projectDataDir;
      await fs.mkdir(projectDataDir, { recursive: true });
    });

    after(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId);
      await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
    });

    it("should return true when override file exists", async () => {
      const { hasProjectAgentOverride } = await import("../project-template.store.js");

      // Create override file
      await fs.writeFile(path.join(testProjectDir, "refinement.override.md"), "override content");

      const result = await hasProjectAgentOverride(projectId, "agents/refinement.md");

      assert.strictEqual(result, true);
    });

    it("should return false when override file does not exist", async () => {
      const { hasProjectAgentOverride } = await import("../project-template.store.js");

      // Create standard agent file but not override
      await fs.writeFile(path.join(testProjectDir, "brainstorm.md"), "standard content");

      const result = await hasProjectAgentOverride(projectId, "agents/brainstorm.md");

      assert.strictEqual(result, false);
    });
  });

  describe("getProjectAgentOverride", () => {
    let testProjectDir: string;
    const homeDir = os.homedir();
    const fleetDir = path.join(homeDir, ".fleet-command");
    const projectId = "test-override-read-" + Date.now();

    before(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId, "template", "agents");
      testProjectDir = projectDataDir;
      await fs.mkdir(projectDataDir, { recursive: true });
    });

    after(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId);
      await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
    });

    it("should return override content when file exists", async () => {
      const { getProjectAgentOverride } = await import("../project-template.store.js");

      // Create override file
      await fs.writeFile(path.join(testProjectDir, "refinement.override.md"), "# Custom Override\n\nThis is custom content.");

      const result = await getProjectAgentOverride(projectId, "agents/refinement.md");

      assert.strictEqual(result, "# Custom Override\n\nThis is custom content.");
    });

    it("should throw when override file does not exist", async () => {
      const { getProjectAgentOverride } = await import("../project-template.store.js");

      const projectId2 = "test-override-no-file-" + Date.now();

      await assert.rejects(
        async () => getProjectAgentOverride(projectId2, "agents/nonexistent.md"),
        /ENOENT/
      );
    });
  });

  describe("saveProjectAgentOverride", () => {
    const homeDir = os.homedir();
    const fleetDir = path.join(homeDir, ".fleet-command");
    const projectId = "test-save-override-" + Date.now();

    after(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId);
      await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
    });

    it("should create override file and directories", async () => {
      const { saveProjectAgentOverride, getProjectAgentOverride } = await import("../project-template.store.js");

      await saveProjectAgentOverride(projectId, "agents/refinement.md", "# Custom Override Content");

      const content = await getProjectAgentOverride(projectId, "agents/refinement.md");
      assert.strictEqual(content, "# Custom Override Content");
    });

    it("should overwrite existing override file", async () => {
      const { saveProjectAgentOverride, getProjectAgentOverride } = await import("../project-template.store.js");

      await saveProjectAgentOverride(projectId, "agents/refinement.md", "First content");
      await saveProjectAgentOverride(projectId, "agents/refinement.md", "Updated content");

      const content = await getProjectAgentOverride(projectId, "agents/refinement.md");
      assert.strictEqual(content, "Updated content");
    });
  });

  describe("deleteProjectAgentOverride", () => {
    const homeDir = os.homedir();
    const fleetDir = path.join(homeDir, ".fleet-command");
    const projectId = "test-delete-override-" + Date.now();

    before(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId, "template", "agents");
      await fs.mkdir(projectDataDir, { recursive: true });
    });

    after(async () => {
      const projectDataDir = path.join(fleetDir, "project-data", projectId);
      await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
    });

    it("should delete existing override file", async () => {
      const { saveProjectAgentOverride, deleteProjectAgentOverride, hasProjectAgentOverride } = await import("../project-template.store.js");

      await saveProjectAgentOverride(projectId, "agents/refinement.md", "content");
      assert.strictEqual(await hasProjectAgentOverride(projectId, "agents/refinement.md"), true);

      await deleteProjectAgentOverride(projectId, "agents/refinement.md");

      assert.strictEqual(await hasProjectAgentOverride(projectId, "agents/refinement.md"), false);
    });

    it("should succeed when override file does not exist (idempotent)", async () => {
      const { deleteProjectAgentOverride } = await import("../project-template.store.js");

      // Should not throw
      await deleteProjectAgentOverride(projectId, "agents/nonexistent.md");
    });
  });
});
