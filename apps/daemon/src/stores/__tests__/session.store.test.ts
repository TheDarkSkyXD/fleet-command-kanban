import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createTicketStore, TicketStore } from "../ticket.store.js";
import { createBrainstormStore, BrainstormStore } from "../brainstorm.store.js";
import { createSessionStore, SessionStore } from "../session.store.js";

describe("SessionStore", () => {
  let db: Database.Database;
  let sessionStore: SessionStore;
  let ticketStore: TicketStore;
  let brainstormStore: BrainstormStore;
  let testDbPath: string;
  let projectId: string;

  before(() => {
    testDbPath = path.join(os.tmpdir(), `fc-session-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);

    const projectStore = createProjectStore(db);
    const project = projectStore.createProject({
      displayName: "Test Project",
      path: "/test/project",
    });
    projectId = project.id;

    sessionStore = createSessionStore(db);
    ticketStore = createTicketStore(db);
    brainstormStore = createBrainstormStore(db);
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
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();
  });

  describe("createSession", () => {
    it("should create a session with generated ID", () => {
      const session = sessionStore.createSession({ projectId });

      assert.ok(session.id);
      assert.ok(session.id.startsWith("sess_"));
      assert.strictEqual(session.projectId, projectId);
      assert.ok(session.startedAt);
      assert.strictEqual(session.endedAt, undefined);
    });

    it("should create session with ticketId", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });

      const session = sessionStore.createSession({
        projectId,
        ticketId: ticket.id,
      });

      assert.strictEqual(session.ticketId, ticket.id);
      assert.strictEqual(session.brainstormId, undefined);
    });

    it("should create session with brainstormId", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);

      const session = sessionStore.createSession({
        projectId,
        brainstormId: brainstorm.id,
      });

      assert.strictEqual(session.brainstormId, brainstorm.id);
      assert.strictEqual(session.ticketId, undefined);
    });

    it("should store optional fields", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });

      const session = sessionStore.createSession({
        projectId,
        ticketId: ticket.id,
        claudeSessionId: "claude_abc123",
        agentSource: "test-agent.md",
        phase: "Refinement",
        metadata: { custom: "data" },
      });

      assert.strictEqual(session.claudeSessionId, "claude_abc123");
      assert.strictEqual(session.agentSource, "test-agent.md");
      assert.strictEqual(session.phase, "Refinement");
      assert.deepStrictEqual(session.metadata, { custom: "data" });
    });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", () => {
      const session = sessionStore.getSession("non-existent");
      assert.strictEqual(session, null);
    });

    it("should return session by ID", () => {
      const created = sessionStore.createSession({ projectId });
      const session = sessionStore.getSession(created.id);

      assert.ok(session);
      assert.strictEqual(session.id, created.id);
    });
  });

  describe("endSession", () => {
    it("should mark session as ended", () => {
      const created = sessionStore.createSession({ projectId });

      const result = sessionStore.endSession(created.id);

      assert.strictEqual(result, true);

      const session = sessionStore.getSession(created.id)!;
      assert.ok(session.endedAt);
    });

    it("should store exit code", () => {
      const created = sessionStore.createSession({ projectId });

      sessionStore.endSession(created.id, 0);

      const session = sessionStore.getSession(created.id)!;
      assert.strictEqual(session.exitCode, 0);
    });

    it("should return false for non-existent session", () => {
      const result = sessionStore.endSession("non-existent");
      assert.strictEqual(result, false);
    });
  });

  describe("updateClaudeSessionId", () => {
    it("should update claude session ID", () => {
      const created = sessionStore.createSession({ projectId });

      const result = sessionStore.updateClaudeSessionId(created.id, "new_claude_id");

      assert.strictEqual(result, true);

      const session = sessionStore.getSession(created.id)!;
      assert.strictEqual(session.claudeSessionId, "new_claude_id");
    });

    it("should return false for non-existent session", () => {
      const result = sessionStore.updateClaudeSessionId("non-existent", "claude_id");
      assert.strictEqual(result, false);
    });
  });

  describe("getSessionsByTicket", () => {
    it("should return empty array when no sessions", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      const sessions = sessionStore.getSessionsByTicket(ticket.id);
      assert.deepStrictEqual(sessions, []);
    });

    it("should return sessions for ticket in order", () => {
      const ticket1 = ticketStore.createTicket(projectId, { title: "Ticket 1" });
      const ticket2 = ticketStore.createTicket(projectId, { title: "Ticket 2" });

      sessionStore.createSession({ projectId, ticketId: ticket1.id });
      sessionStore.createSession({ projectId, ticketId: ticket1.id });
      sessionStore.createSession({ projectId, ticketId: ticket2.id }); // different ticket

      const sessions = sessionStore.getSessionsByTicket(ticket1.id);

      assert.strictEqual(sessions.length, 2);
      assert.ok(sessions[0].startedAt <= sessions[1].startedAt);
    });
  });

  describe("getSessionsByBrainstorm", () => {
    it("should return empty array when no sessions", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      const sessions = sessionStore.getSessionsByBrainstorm(brainstorm.id);
      assert.deepStrictEqual(sessions, []);
    });

    it("should return sessions for brainstorm", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);

      sessionStore.createSession({ projectId, brainstormId: brainstorm.id });
      sessionStore.createSession({ projectId, brainstormId: brainstorm.id });

      const sessions = sessionStore.getSessionsByBrainstorm(brainstorm.id);

      assert.strictEqual(sessions.length, 2);
    });
  });

  describe("getActiveSessionForTicket", () => {
    it("should return null when no active sessions", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      const session = sessionStore.getActiveSessionForTicket(ticket.id);
      assert.strictEqual(session, null);
    });

    it("should return active session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      const created = sessionStore.createSession({ projectId, ticketId: ticket.id });

      const active = sessionStore.getActiveSessionForTicket(ticket.id);

      assert.ok(active);
      assert.strictEqual(active.id, created.id);
    });

    it("should not return ended session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      const created = sessionStore.createSession({ projectId, ticketId: ticket.id });
      sessionStore.endSession(created.id);

      const active = sessionStore.getActiveSessionForTicket(ticket.id);

      assert.strictEqual(active, null);
    });

    it("should return most recent active session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });

      const first = sessionStore.createSession({ projectId, ticketId: ticket.id });
      sessionStore.endSession(first.id);
      const second = sessionStore.createSession({ projectId, ticketId: ticket.id });

      const active = sessionStore.getActiveSessionForTicket(ticket.id);

      assert.ok(active);
      assert.strictEqual(active.id, second.id);
    });
  });

  describe("getActiveSessionForBrainstorm", () => {
    it("should return null when no active sessions", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      const session = sessionStore.getActiveSessionForBrainstorm(brainstorm.id);
      assert.strictEqual(session, null);
    });

    it("should return active session", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      const created = sessionStore.createSession({ projectId, brainstormId: brainstorm.id });

      const active = sessionStore.getActiveSessionForBrainstorm(brainstorm.id);

      assert.ok(active);
      assert.strictEqual(active.id, created.id);
    });
  });

  describe("hasActiveSession", () => {
    it("should return false when no ticket or brainstorm", () => {
      const result = sessionStore.hasActiveSession();
      assert.strictEqual(result, false);
    });

    it("should return true when ticket has active session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      sessionStore.createSession({ projectId, ticketId: ticket.id });

      const result = sessionStore.hasActiveSession(ticket.id);

      assert.strictEqual(result, true);
    });

    it("should return false when ticket has no active session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      const session = sessionStore.createSession({ projectId, ticketId: ticket.id });
      sessionStore.endSession(session.id);

      const result = sessionStore.hasActiveSession(ticket.id);

      assert.strictEqual(result, false);
    });

    it("should return true when brainstorm has active session", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      sessionStore.createSession({ projectId, brainstormId: brainstorm.id });

      const result = sessionStore.hasActiveSession(undefined, brainstorm.id);

      assert.strictEqual(result, true);
    });
  });

  describe("getLatestClaudeSessionId", () => {
    it("should return null when no sessions", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      const result = sessionStore.getLatestClaudeSessionId(brainstorm.id);
      assert.strictEqual(result, null);
    });

    it("should return null when no claude session ID set", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);
      sessionStore.createSession({ projectId, brainstormId: brainstorm.id });

      const result = sessionStore.getLatestClaudeSessionId(brainstorm.id);

      assert.strictEqual(result, null);
    });

    it("should return latest claude session ID", () => {
      const brainstorm = brainstormStore.createBrainstorm(projectId);

      sessionStore.createSession({
        projectId,
        brainstormId: brainstorm.id,
        claudeSessionId: "claude_first",
      });
      sessionStore.createSession({
        projectId,
        brainstormId: brainstorm.id,
        claudeSessionId: "claude_second",
      });

      const result = sessionStore.getLatestClaudeSessionId(brainstorm.id);

      assert.strictEqual(result, "claude_second");
    });
  });

  describe("getLatestClaudeSessionIdForTicket", () => {
    it("should return null when no sessions exist for ticket", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });
      const result = sessionStore.getLatestClaudeSessionIdForTicket(ticket.id);
      assert.strictEqual(result, null);
    });

    it("should return the claude session id from the latest session", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket 2" });
      const session = sessionStore.createSession({
        projectId,
        ticketId: ticket.id,
        claudeSessionId: "claude_sess_abc",
        agentSource: "test",
      });
      const result = sessionStore.getLatestClaudeSessionIdForTicket(ticket.id);
      assert.strictEqual(result, "claude_sess_abc");
    });

    it("should return the most recent claude session id", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket 3" });
      sessionStore.createSession({
        projectId,
        ticketId: ticket.id,
        claudeSessionId: "claude_sess_old",
        agentSource: "test",
      });
      sessionStore.createSession({
        projectId,
        ticketId: ticket.id,
        claudeSessionId: "claude_sess_new",
        agentSource: "test",
      });
      const result = sessionStore.getLatestClaudeSessionIdForTicket(ticket.id);
      assert.strictEqual(result, "claude_sess_new");
    });
  });
});
