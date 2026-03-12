import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createTicketStore, TicketStore } from "../ticket.store.js";
import { createArtifactStore, ArtifactStore } from "../artifact.store.js";

describe("ArtifactStore", () => {
  let db: Database.Database;
  let artifactStore: ArtifactStore;
  let ticketStore: TicketStore;
  let testDbPath: string;
  let projectId: string;
  let ticketId: string;

  before(() => {
    testDbPath = path.join(os.tmpdir(), `fc-artifact-test-${Date.now()}.db`);
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
    artifactStore = createArtifactStore(db);
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
    db.prepare("DELETE FROM artifact_versions").run();
    db.prepare("DELETE FROM artifacts").run();
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();

    // Create a fresh ticket for each test
    const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });
    ticketId = ticket.id;
  });

  describe("createArtifact", () => {
    it("should create artifact with UUID", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "specification.md",
        type: "markdown",
        filePath: "/path/to/specification.md",
      });

      // UUID format check
      assert.ok(artifact.id);
      assert.match(artifact.id, /^[0-9a-f-]{36}$/i);

      assert.strictEqual(artifact.ticketId, ticketId);
      assert.strictEqual(artifact.filename, "specification.md");
      assert.strictEqual(artifact.type, "markdown");
      assert.strictEqual(artifact.filePath, "/path/to/specification.md");
      assert.ok(artifact.createdAt);
      assert.ok(artifact.updatedAt);
    });

    it("should create artifact with optional fields", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "architecture.md",
        type: "markdown",
        description: "System architecture document",
        phase: "Refinement",
        filePath: "/path/to/architecture.md",
      });

      assert.strictEqual(artifact.description, "System architecture document");
      assert.strictEqual(artifact.phase, "Refinement");
    });

    it("should enforce unique filename per ticket", () => {
      artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      assert.throws(() => {
        artifactStore.createArtifact({
          ticketId,
          filename: "spec.md",
          type: "markdown",
          filePath: "/different/path/to/spec.md",
        });
      });
    });

    it("should allow same filename for different tickets", () => {
      const ticket2 = ticketStore.createTicket(projectId, { title: "Another Ticket" });

      const artifact1 = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/ticket1/spec.md",
      });

      const artifact2 = artifactStore.createArtifact({
        ticketId: ticket2.id,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/ticket2/spec.md",
      });

      assert.ok(artifact1.id);
      assert.ok(artifact2.id);
      assert.notStrictEqual(artifact1.id, artifact2.id);
    });
  });

  describe("getArtifact", () => {
    it("should return null for non-existent artifact", () => {
      const artifact = artifactStore.getArtifact("non-existent-uuid");
      assert.strictEqual(artifact, null);
    });

    it("should return artifact by ID", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "test.md",
        type: "markdown",
        filePath: "/path/to/test.md",
      });

      const artifact = artifactStore.getArtifact(created.id);

      assert.ok(artifact);
      assert.strictEqual(artifact.id, created.id);
      assert.strictEqual(artifact.filename, "test.md");
    });
  });

  describe("getArtifactByFilename", () => {
    it("should return null for non-existent filename", () => {
      const artifact = artifactStore.getArtifactByFilename(ticketId, "nonexistent.md");
      assert.strictEqual(artifact, null);
    });

    it("should return artifact by ticket and filename", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const artifact = artifactStore.getArtifactByFilename(ticketId, "spec.md");

      assert.ok(artifact);
      assert.strictEqual(artifact.id, created.id);
      assert.strictEqual(artifact.filename, "spec.md");
    });

    it("should not return artifact for different ticket", () => {
      const ticket2 = ticketStore.createTicket(projectId, { title: "Another Ticket" });

      artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const artifact = artifactStore.getArtifactByFilename(ticket2.id, "spec.md");
      assert.strictEqual(artifact, null);
    });
  });

  describe("listArtifacts", () => {
    it("should return empty array when no artifacts", () => {
      const artifacts = artifactStore.listArtifacts(ticketId);
      assert.deepStrictEqual(artifacts, []);
    });

    it("should return all artifacts for ticket", () => {
      artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });
      artifactStore.createArtifact({
        ticketId,
        filename: "diagram.png",
        type: "image",
        filePath: "/path/to/diagram.png",
      });
      artifactStore.createArtifact({
        ticketId,
        filename: "notes.txt",
        type: "text",
        filePath: "/path/to/notes.txt",
      });

      const artifacts = artifactStore.listArtifacts(ticketId);

      assert.strictEqual(artifacts.length, 3);
    });

    it("should not return artifacts from other tickets", () => {
      const ticket2 = ticketStore.createTicket(projectId, { title: "Another Ticket" });

      artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });
      artifactStore.createArtifact({
        ticketId: ticket2.id,
        filename: "other.md",
        type: "markdown",
        filePath: "/path/to/other.md",
      });

      const artifacts = artifactStore.listArtifacts(ticketId);

      assert.strictEqual(artifacts.length, 1);
      assert.strictEqual(artifacts[0].filename, "spec.md");
    });

    it("should order by created_at", () => {
      const artifact1 = artifactStore.createArtifact({
        ticketId,
        filename: "first.md",
        type: "markdown",
        filePath: "/path/to/first.md",
      });
      const artifact2 = artifactStore.createArtifact({
        ticketId,
        filename: "second.md",
        type: "markdown",
        filePath: "/path/to/second.md",
      });
      const artifact3 = artifactStore.createArtifact({
        ticketId,
        filename: "third.md",
        type: "markdown",
        filePath: "/path/to/third.md",
      });

      const artifacts = artifactStore.listArtifacts(ticketId);

      assert.strictEqual(artifacts[0].id, artifact1.id);
      assert.strictEqual(artifacts[1].id, artifact2.id);
      assert.strictEqual(artifacts[2].id, artifact3.id);
    });
  });

  describe("updateArtifact", () => {
    it("should update description", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const updated = artifactStore.updateArtifact(created.id, {
        description: "Updated description",
      });

      assert.ok(updated);
      assert.strictEqual(updated.description, "Updated description");
      // updatedAt should be set (at least equal to or greater than createdAt)
      assert.ok(updated.updatedAt >= created.updatedAt);
    });

    it("should update phase", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const updated = artifactStore.updateArtifact(created.id, {
        phase: "Implementation",
      });

      assert.ok(updated);
      assert.strictEqual(updated.phase, "Implementation");
    });

    it("should update file path", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const updated = artifactStore.updateArtifact(created.id, {
        filePath: "/new/path/to/spec.md",
      });

      assert.ok(updated);
      assert.strictEqual(updated.filePath, "/new/path/to/spec.md");
    });

    it("should update multiple fields at once", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const updated = artifactStore.updateArtifact(created.id, {
        description: "New description",
        phase: "Testing",
        filePath: "/updated/path.md",
      });

      assert.ok(updated);
      assert.strictEqual(updated.description, "New description");
      assert.strictEqual(updated.phase, "Testing");
      assert.strictEqual(updated.filePath, "/updated/path.md");
    });

    it("should return null for non-existent artifact", () => {
      const result = artifactStore.updateArtifact("non-existent", {
        description: "Updated",
      });
      assert.strictEqual(result, null);
    });

    it("should preserve unchanged fields", () => {
      const created = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        description: "Original description",
        phase: "Ideas",
        filePath: "/path/to/spec.md",
      });

      const updated = artifactStore.updateArtifact(created.id, {
        phase: "Refinement",
      });

      assert.ok(updated);
      assert.strictEqual(updated.description, "Original description");
      assert.strictEqual(updated.phase, "Refinement");
      assert.strictEqual(updated.filename, "spec.md");
    });
  });

  describe("deleteArtifact", () => {
    it("should delete artifact", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const deleted = artifactStore.deleteArtifact(artifact.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(artifactStore.getArtifact(artifact.id), null);
    });

    it("should delete artifact and its versions (cascade)", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v1.md",
        description: "Version 1",
      });
      artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v2.md",
        description: "Version 2",
      });

      const deleted = artifactStore.deleteArtifact(artifact.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(artifactStore.getArtifact(artifact.id), null);
      assert.deepStrictEqual(artifactStore.getVersions(artifact.id), []);
    });

    it("should return false for non-existent artifact", () => {
      const deleted = artifactStore.deleteArtifact("non-existent");
      assert.strictEqual(deleted, false);
    });
  });

  describe("addVersion", () => {
    it("should add version with auto-incrementing version number", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const version = artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v1.md",
      });

      assert.ok(version);
      assert.ok(version.id);
      assert.match(version.id, /^[0-9a-f-]{36}$/i);
      assert.strictEqual(version.artifactId, artifact.id);
      assert.strictEqual(version.version, 1);
      assert.strictEqual(version.filePath, "/path/to/spec.v1.md");
      assert.ok(version.createdAt);
    });

    it("should increment version number for each new version", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const v1 = artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v1.md",
      });
      const v2 = artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v2.md",
      });
      const v3 = artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v3.md",
      });

      assert.ok(v1);
      assert.ok(v2);
      assert.ok(v3);
      assert.strictEqual(v1.version, 1);
      assert.strictEqual(v2.version, 2);
      assert.strictEqual(v3.version, 3);
    });

    it("should store optional description", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const version = artifactStore.addVersion(artifact.id, {
        filePath: "/path/to/spec.v1.md",
        description: "First revision with bug fixes",
      });

      assert.ok(version);
      assert.strictEqual(version.description, "First revision with bug fixes");
    });

    it("should return null for non-existent artifact", () => {
      const version = artifactStore.addVersion("non-existent", {
        filePath: "/path/to/file.md",
      });
      assert.strictEqual(version, null);
    });
  });

  describe("getVersions", () => {
    it("should return empty array when no versions", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const versions = artifactStore.getVersions(artifact.id);
      assert.deepStrictEqual(versions, []);
    });

    it("should return all versions ordered by version number", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      artifactStore.addVersion(artifact.id, { filePath: "/v1.md" });
      artifactStore.addVersion(artifact.id, { filePath: "/v2.md" });
      artifactStore.addVersion(artifact.id, { filePath: "/v3.md" });

      const versions = artifactStore.getVersions(artifact.id);

      assert.strictEqual(versions.length, 3);
      assert.strictEqual(versions[0].version, 1);
      assert.strictEqual(versions[1].version, 2);
      assert.strictEqual(versions[2].version, 3);
    });
  });

  describe("getLatestVersion", () => {
    it("should return null when no versions", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      const version = artifactStore.getLatestVersion(artifact.id);
      assert.strictEqual(version, null);
    });

    it("should return latest version by version number", () => {
      const artifact = artifactStore.createArtifact({
        ticketId,
        filename: "spec.md",
        type: "markdown",
        filePath: "/path/to/spec.md",
      });

      artifactStore.addVersion(artifact.id, {
        filePath: "/v1.md",
        description: "First version",
      });
      artifactStore.addVersion(artifact.id, {
        filePath: "/v2.md",
        description: "Second version",
      });
      artifactStore.addVersion(artifact.id, {
        filePath: "/v3.md",
        description: "Third version",
      });

      const latest = artifactStore.getLatestVersion(artifact.id);

      assert.ok(latest);
      assert.strictEqual(latest.version, 3);
      assert.strictEqual(latest.description, "Third version");
      assert.strictEqual(latest.filePath, "/v3.md");
    });
  });
});
