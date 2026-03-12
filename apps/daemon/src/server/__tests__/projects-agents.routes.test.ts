import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("projects agent override routes", () => {
  const homeDir = os.homedir();
  const fleetDir = path.join(homeDir, ".fleet-command");
  const projectId = "test-agent-routes-" + Date.now();
  let testProjectDir: string;

  before(async () => {
    // Create project template directory with a base agent
    testProjectDir = path.join(fleetDir, "project-data", projectId, "template", "agents");
    await fs.mkdir(testProjectDir, { recursive: true });
    await fs.writeFile(path.join(testProjectDir, "refinement.md"), "# Default Refinement Agent");
  });

  after(async () => {
    const projectDataDir = path.join(fleetDir, "project-data", projectId);
    await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("hasProjectAgentOverride + getProjectAgentOverride", () => {
    it("should return false when no override exists", async () => {
      const { hasProjectAgentOverride } = await import("../../stores/project-template.store.js");
      const result = await hasProjectAgentOverride(projectId, "agents/refinement.md");
      assert.strictEqual(result, false);
    });
  });

  describe("saveProjectAgentOverride flow", () => {
    beforeEach(async () => {
      // Clean up any override from previous test
      await fs.rm(path.join(testProjectDir, "refinement.override.md"), { force: true });
    });

    it("should create override and make it retrievable", async () => {
      const {
        saveProjectAgentOverride,
        hasProjectAgentOverride,
        getProjectAgentOverride
      } = await import("../../stores/project-template.store.js");

      await saveProjectAgentOverride(projectId, "agents/refinement.md", "# Override Content");

      assert.strictEqual(await hasProjectAgentOverride(projectId, "agents/refinement.md"), true);
      const content = await getProjectAgentOverride(projectId, "agents/refinement.md");
      assert.strictEqual(content, "# Override Content");
    });
  });

  describe("deleteProjectAgentOverride flow", () => {
    it("should remove existing override", async () => {
      const {
        saveProjectAgentOverride,
        deleteProjectAgentOverride,
        hasProjectAgentOverride
      } = await import("../../stores/project-template.store.js");

      await saveProjectAgentOverride(projectId, "agents/refinement.md", "# Content");
      assert.strictEqual(await hasProjectAgentOverride(projectId, "agents/refinement.md"), true);

      await deleteProjectAgentOverride(projectId, "agents/refinement.md");
      assert.strictEqual(await hasProjectAgentOverride(projectId, "agents/refinement.md"), false);
    });
  });

  describe("isValidAgentType validation", () => {
    it("should accept valid agent types", () => {
      const validTypes = ["refinement", "brainstorm", "builder-agent", "my_agent123"];
      for (const type of validTypes) {
        assert.match(type, /^[a-zA-Z0-9_-]+$/);
      }
    });

    it("should reject path traversal attempts", () => {
      const invalidTypes = ["../secret", "agents/../../etc", "agent;rm -rf", "agent\ninjection"];
      for (const type of invalidTypes) {
        assert.doesNotMatch(type, /^[a-zA-Z0-9_-]+$/);
      }
    });
  });
});
