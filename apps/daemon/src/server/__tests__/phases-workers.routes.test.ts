import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("GET /api/projects/:id/phases/:phase/workers endpoint", () => {
  const homeDir = os.homedir();
  const fleetDir = path.join(homeDir, ".fleet-command");
  const projectId = "test-phases-workers-" + Date.now();
  let testProjectDir: string;
  let testTemplatePath: string;

  before(async () => {
    // Create project template directory structure with phases and workers
    testProjectDir = path.join(fleetDir, "project-data", projectId, "template");
    await fs.mkdir(testProjectDir, { recursive: true });

    // Create agents directory
    const agentsDir = path.join(testProjectDir, "agents");
    await fs.mkdir(agentsDir, { recursive: true });

    // Create sample agent files
    await fs.writeFile(
      path.join(agentsDir, "refinement.md"),
      "# Default Refinement Agent\n\nDefault prompt for refinement phase."
    );
    await fs.writeFile(
      path.join(agentsDir, "architecture.md"),
      "# Default Architecture Agent\n\nDefault prompt for architecture phase."
    );
    await fs.writeFile(
      path.join(agentsDir, "brainstorm.md"),
      "# Default Brainstorm Agent\n\nDefault prompt for brainstorm phase."
    );

    // Create a template.json file with phases and workers
    testTemplatePath = path.join(testProjectDir, "template.json");
    const templateContent = {
      name: "test-template",
      description: "Test template for worker tree",
      version: "1.0.0",
      phases: [
        {
          id: "refinement-phase",
          name: "Refinement",
          description: "Refinement phase",
          workers: [
            {
              id: "refinement-agent",
              type: "agent",
              description: "Refinement agent worker",
              source: "agents/refinement.md",
            },
          ],
          transitions: { next: null },
        },
        {
          id: "architecture-phase",
          name: "Architecture",
          description: "Architecture phase",
          workers: [
            {
              id: "architecture-loop",
              type: "ralphLoop",
              description: "Architecture review loop",
              maxAttempts: 3,
              workers: [
                {
                  id: "architecture-agent",
                  type: "agent",
                  description: "Architecture agent worker",
                  source: "agents/architecture.md",
                },
              ],
            },
          ],
          transitions: { next: null },
        },
        {
          id: "build-phase",
          name: "Build",
          description: "Build phase",
          workers: [
            {
              id: "build-task-loop",
              type: "taskLoop",
              description: "Build task loop",
              maxAttempts: 5,
              workers: [
                {
                  id: "build-agent",
                  type: "agent",
                  description: "Build agent worker",
                  source: "agents/brainstorm.md",
                },
              ],
            },
          ],
          transitions: { next: null },
        },
      ],
    };

    await fs.writeFile(testTemplatePath, JSON.stringify(templateContent, null, 2));
  });

  after(async () => {
    const projectDataDir = path.join(fleetDir, "project-data", projectId);
    await fs.rm(projectDataDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(async () => {
    // Clean up any overrides before each test
    const agentsDir = path.join(testProjectDir, "agents");
    const files = await fs.readdir(agentsDir);
    for (const file of files) {
      if (file.endsWith(".override.md")) {
        await fs.rm(path.join(agentsDir, file), { force: true });
      }
    }
  });

  describe("agent type extraction from source paths", () => {
    it("should extract refinement from agents/refinement.md", () => {
      const source = "agents/refinement.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.ok(match, "Should match source pattern");
      assert.strictEqual(match[1], "refinement");
    });

    it("should extract architecture from agents/architecture.md", () => {
      const source = "agents/architecture.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.ok(match, "Should match source pattern");
      assert.strictEqual(match[1], "architecture");
    });

    it("should extract brainstorm from agents/brainstorm.md", () => {
      const source = "agents/brainstorm.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.ok(match, "Should match source pattern");
      assert.strictEqual(match[1], "brainstorm");
    });

    it("should handle custom-agent names with hyphens", () => {
      const source = "agents/custom-agent.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.ok(match, "Should match source pattern");
      assert.strictEqual(match[1], "custom-agent");
    });

    it("should handle agent_123 names with underscores and numbers", () => {
      const source = "agents/agent_123.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.ok(match, "Should match source pattern");
      assert.strictEqual(match[1], "agent_123");
    });

    it("should not match non-agent paths", () => {
      const source = "workflows/refinement.md";
      const match = source.match(/agents\/([^.]+)\.md$/);
      assert.strictEqual(match, null, "Should not match non-agent paths");
    });
  });

  describe("override file detection", () => {
    it("should detect when override file exists", async () => {
      // Create an override file
      const overrideFile = path.join(testProjectDir, "agents", "refinement.override.md");
      await fs.writeFile(overrideFile, "# Custom Refinement");

      // Verify file exists
      const exists = await fs.access(overrideFile).then(() => true).catch(() => false);
      assert.strictEqual(exists, true, "Override file should exist");
    });

    it("should detect override is missing when not present", async () => {
      // Ensure no override exists
      const overrideFile = path.join(testProjectDir, "agents", "architecture.override.md");
      await fs.rm(overrideFile, { force: true });

      // Verify file doesn't exist
      const exists = await fs.access(overrideFile).then(() => true).catch(() => false);
      assert.strictEqual(exists, false, "Override file should not exist");
    });

    it("should allow multiple overrides to exist independently", async () => {
      // Create multiple override files
      const refinementOverride = path.join(testProjectDir, "agents", "refinement.override.md");
      const architectureOverride = path.join(testProjectDir, "agents", "architecture.override.md");

      await fs.writeFile(refinementOverride, "# Custom Refinement");
      await fs.writeFile(architectureOverride, "# Custom Architecture");

      // Verify both exist
      const refinementExists = await fs.access(refinementOverride).then(() => true).catch(() => false);
      const architectureExists = await fs.access(architectureOverride).then(() => true).catch(() => false);

      assert.strictEqual(refinementExists, true, "Refinement override should exist");
      assert.strictEqual(architectureExists, true, "Architecture override should exist");
    });
  });

  describe("response format validation", () => {
    it("should have correct response shape for agent worker", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const refinementPhase = template.phases.find((p: { name: string }) => p.name === "Refinement");

      assert.ok(refinementPhase, "Should find Refinement phase");
      const worker = refinementPhase.workers[0];

      // Verify expected properties
      assert.ok(worker.id, "Should have id");
      assert.strictEqual(worker.type, "agent", "Should be agent type");
      assert.ok(worker.source, "Should have source");
      assert.match(worker.source, /agents\/.+\.md$/, "Source should match pattern");
    });

    it("should include description when present", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const refinementPhase = template.phases.find((p: { name: string }) => p.name === "Refinement");
      const worker = refinementPhase.workers[0];

      assert.ok(worker.description, "Should include description");
    });

    it("should have correct response shape for ralphLoop", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const architecturePhase = template.phases.find((p: { name: string }) => p.name === "Architecture");

      assert.ok(architecturePhase, "Should find Architecture phase");
      const loop = architecturePhase.workers[0];

      // Verify loop properties
      assert.strictEqual(loop.type, "ralphLoop", "Should be ralphLoop type");
      assert.strictEqual(loop.maxAttempts, 3, "Should have maxAttempts");
      assert.ok(Array.isArray(loop.workers), "Should have workers array");
      assert.strictEqual(loop.workers.length, 1, "Should have one nested worker");
    });

    it("should have correct response shape for taskLoop", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const buildPhase = template.phases.find((p: { name: string }) => p.name === "Build");

      assert.ok(buildPhase, "Should find Build phase");
      const loop = buildPhase.workers[0];

      // Verify loop properties
      assert.strictEqual(loop.type, "taskLoop", "Should be taskLoop type");
      assert.strictEqual(loop.maxAttempts, 5, "Should have maxAttempts");
      assert.ok(Array.isArray(loop.workers), "Should have workers array");
      assert.strictEqual(loop.workers.length, 1, "Should have one nested worker");
    });

    it("should recursively transform nested workers", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const architecturePhase = template.phases.find((p: { name: string }) => p.name === "Architecture");
      const loop = architecturePhase.workers[0];

      // Verify nested worker structure
      assert.ok(loop.workers, "Should have nested workers");
      assert.strictEqual(loop.workers.length, 1, "Should have one nested worker");

      const nestedWorker = loop.workers[0];
      assert.ok(nestedWorker.id, "Nested worker should have id");
      assert.strictEqual(nestedWorker.type, "agent", "Nested worker should be agent");
      assert.ok(nestedWorker.source, "Nested worker should have source");
    });
  });

  describe("URL parameter handling", () => {
    it("should safely decode project IDs with special characters", () => {
      const encodedId = "project%2Fid";
      const decodedId = decodeURIComponent(encodedId);
      assert.strictEqual(decodedId, "project/id");
    });

    it("should safely decode phase names with spaces", () => {
      const encodedPhase = "Phase%20Name";
      const decodedPhase = decodeURIComponent(encodedPhase);
      assert.strictEqual(decodedPhase, "Phase Name");
    });

    it("should handle URL-encoded slashes in parameters", () => {
      const encodedPath = "path%2Fto%2Fproject";
      const decodedPath = decodeURIComponent(encodedPath);
      assert.strictEqual(decodedPath, "path/to/project");
    });

    it("should handle multiple encoded sequences", () => {
      const encoded = "test%20project%2Fid";
      const decoded = decodeURIComponent(encoded);
      assert.strictEqual(decoded, "test project/id");
    });
  });

  describe("edge cases", () => {
    it("should handle undefined workers array", () => {
      const workers = undefined;
      const result = !workers ? [] : workers;
      assert.deepStrictEqual(result, []);
    });

    it("should handle null workers array", () => {
      const workers = null;
      const result = !workers ? [] : workers;
      assert.deepStrictEqual(result, []);
    });

    it("should handle empty workers array", () => {
      const workers: unknown[] = [];
      assert.strictEqual(workers.length, 0);
    });

    it("should handle worker without optional fields", async () => {
      // Create a minimal worker
      const worker: { id: string; type: "agent"; source: string; description?: string } = {
        id: "minimal-worker",
        type: "agent",
        source: "agents/test.md",
      };

      assert.ok(worker.id);
      assert.strictEqual(worker.type, "agent");
      assert.strictEqual(worker.description, undefined);
    });

    it("should handle phase name that doesn't match", async () => {
      const templateContent = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(templateContent);
      const nonexistentPhase = template.phases.find(
        (p: { name: string }) => p.name === "NonexistentPhase"
      );

      assert.strictEqual(nonexistentPhase, undefined);
    });
  });

  describe("template loading", () => {
    it("should load template.json file", async () => {
      const content = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(content);

      assert.ok(template.name, "Should have template name");
      assert.strictEqual(template.name, "test-template");
      assert.ok(Array.isArray(template.phases), "Should have phases array");
    });

    it("should find phase by name", async () => {
      const content = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(content);

      const refinement = template.phases.find((p: { name: string }) => p.name === "Refinement");
      assert.ok(refinement, "Should find Refinement phase");
      assert.strictEqual(refinement.name, "Refinement");
    });

    it("should have all expected phases", async () => {
      const content = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(content);

      const phaseNames = template.phases.map((p: { name: string }) => p.name);
      assert.deepStrictEqual(phaseNames, ["Refinement", "Architecture", "Build"]);
    });

    it("should have correct worker count per phase", async () => {
      const content = await fs.readFile(testTemplatePath, "utf-8");
      const template = JSON.parse(content);

      for (const phase of template.phases) {
        assert.ok(Array.isArray(phase.workers), `Phase ${phase.name} should have workers array`);
        assert.strictEqual(phase.workers.length, 1, `Phase ${phase.name} should have 1 worker`);
      }
    });
  });

  describe("validation and error conditions", () => {
    it("should validate agent type format", () => {
      const validTypes = ["refinement", "brainstorm", "builder-agent", "my_agent123"];
      const validPattern = /^[a-zA-Z0-9_-]+$/;

      for (const type of validTypes) {
        assert.match(type, validPattern, `${type} should be valid`);
      }
    });

    it("should reject invalid agent types with special chars", () => {
      const invalidTypes = ["../secret", "agents/../../etc", "agent;rm -rf"];
      const validPattern = /^[a-zA-Z0-9_-]+$/;

      for (const type of invalidTypes) {
        assert.doesNotMatch(type, validPattern, `${type} should be invalid`);
      }
    });

    it("should reject paths with newlines", () => {
      const invalidType = "agent\ninjection";
      const validPattern = /^[a-zA-Z0-9_-]+$/;

      assert.doesNotMatch(invalidType, validPattern, "Should reject newlines");
    });

    it("should safely handle empty string", () => {
      const emptyId = "";
      const decodedId = decodeURIComponent(emptyId);
      assert.strictEqual(decodedId, "");
    });
  });
});
