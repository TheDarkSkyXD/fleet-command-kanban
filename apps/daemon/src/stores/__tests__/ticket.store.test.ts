import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createTicketStore, TicketStore } from "../ticket.store.js";

// Ticket ID regex pattern (e.g., "TES-1", "POT-42")
const TICKET_ID_REGEX = /^[A-Z]{1,3}-\d+$/;

describe("TicketStore", () => {
  let db: Database.Database;
  let ticketStore: TicketStore;
  let testDbPath: string;
  let projectId: string;

  before(() => {
    // Create a temp database for integration tests
    testDbPath = path.join(os.tmpdir(), `fc-ticket-test-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma("journal_mode = WAL");
    runMigrations(db);

    // Create a test project
    const projectStore = createProjectStore(db);
    const project = projectStore.createProject({
      displayName: "Test Project",
      path: "/test/project",
    });
    projectId = project.id;

    ticketStore = createTicketStore(db);
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
    // Clear tickets and related tables before each test
    // Order matters due to foreign key constraints:
    // 1. sessions references tickets/brainstorms
    // 2. conversation_messages references conversations
    // 3. ticket_history references tickets
    // 4. tickets references conversations
    // 5. conversations (no more dependencies)
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM conversation_messages").run();
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();
  });

  describe("createTicket", () => {
    it("should create a ticket with prefix-based ID", () => {
      const ticket = ticketStore.createTicket(projectId, {
        title: "My First Ticket",
      });

      assert.match(ticket.id, TICKET_ID_REGEX, "ID should be prefix-based");
      assert.strictEqual(ticket.title, "My First Ticket");
      assert.strictEqual(ticket.phase, "Ideas");
      assert.strictEqual(ticket.project, projectId);
      assert.ok(ticket.createdAt);
      assert.ok(ticket.updatedAt);
      assert.strictEqual(ticket.archived, false);
    });

    it("should auto-increment ticket numbers", () => {
      const ticket1 = ticketStore.createTicket(projectId, { title: "First" });
      const ticket2 = ticketStore.createTicket(projectId, { title: "Second" });
      const ticket3 = ticketStore.createTicket(projectId, { title: "Third" });

      // Extract numbers from IDs (e.g., "TES-1" -> 1)
      const num1 = parseInt(ticket1.id.split("-")[1], 10);
      const num2 = parseInt(ticket2.id.split("-")[1], 10);
      const num3 = parseInt(ticket3.id.split("-")[1], 10);

      assert.strictEqual(num2, num1 + 1);
      assert.strictEqual(num3, num2 + 1);
    });

    it("should create initial history entry for Ideas phase", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });

      assert.strictEqual(ticket.history.length, 1);
      assert.strictEqual(ticket.history[0].phase, "Ideas");
      assert.ok(ticket.history[0].at);
      assert.strictEqual(ticket.history[0].endedAt, undefined);
    });
  });

  describe("getTicket", () => {
    it("should return null for non-existent ticket", () => {
      const ticket = ticketStore.getTicket(projectId, "NON-EXISTENT");
      assert.strictEqual(ticket, null);
    });

    it("should return ticket by ID", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });
      const ticket = ticketStore.getTicket(projectId, created.id);

      assert.ok(ticket);
      assert.strictEqual(ticket.id, created.id);
      assert.strictEqual(ticket.title, "Test");
    });
  });

  describe("getTicketById", () => {
    it("should return ticket without requiring projectId", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });
      const ticket = ticketStore.getTicketById(created.id);

      assert.ok(ticket);
      assert.strictEqual(ticket.id, created.id);
    });
  });

  describe("listTickets", () => {
    it("should return empty array when no tickets", () => {
      const tickets = ticketStore.listTickets(projectId);
      assert.deepStrictEqual(tickets, []);
    });

    it("should return all non-archived tickets by default", () => {
      ticketStore.createTicket(projectId, { title: "Ticket 1" });
      ticketStore.createTicket(projectId, { title: "Ticket 2" });
      ticketStore.createTicket(projectId, { title: "Ticket 3" });

      const tickets = ticketStore.listTickets(projectId);
      assert.strictEqual(tickets.length, 3);
    });

    it("should filter by phase", () => {
      ticketStore.createTicket(projectId, { title: "Ideas Ticket" });
      const ticket2 = ticketStore.createTicket(projectId, { title: "Backlog Ticket" });
      ticketStore.updateTicket(projectId, ticket2.id, { phase: "Backlog" });

      const ideasTickets = ticketStore.listTickets(projectId, { phase: "Ideas" });
      const backlogTickets = ticketStore.listTickets(projectId, { phase: "Backlog" });

      assert.strictEqual(ideasTickets.length, 1);
      assert.strictEqual(backlogTickets.length, 1);
      assert.strictEqual(ideasTickets[0].title, "Ideas Ticket");
      assert.strictEqual(backlogTickets[0].title, "Backlog Ticket");
    });

    it("should filter archived tickets", () => {
      ticketStore.createTicket(projectId, { title: "Active" });
      const toArchive = ticketStore.createTicket(projectId, { title: "To Archive" });

      // Move to Done and archive
      ticketStore.updateTicket(projectId, toArchive.id, { phase: "Done" });
      ticketStore.archiveTicket(projectId, toArchive.id);

      const activeTickets = ticketStore.listTickets(projectId, { archived: false });
      const archivedTickets = ticketStore.listTickets(projectId, { archived: true });

      assert.strictEqual(activeTickets.length, 1);
      assert.strictEqual(archivedTickets.length, 1);
      assert.strictEqual(activeTickets[0].title, "Active");
      assert.strictEqual(archivedTickets[0].title, "To Archive");
    });

    it("should sort by updated_at descending", () => {
      const ticket1 = ticketStore.createTicket(projectId, { title: "First" });
      ticketStore.createTicket(projectId, { title: "Second" });

      // Update first ticket to make it most recently updated
      ticketStore.updateTicket(projectId, ticket1.id, { title: "First Updated" });

      const tickets = ticketStore.listTickets(projectId);
      assert.strictEqual(tickets[0].title, "First Updated");
    });
  });

  describe("updateTicket", () => {
    it("should update title", () => {
      const created = ticketStore.createTicket(projectId, { title: "Original" });
      const updated = ticketStore.updateTicket(projectId, created.id, {
        title: "Updated Title",
      });

      assert.strictEqual(updated?.title, "Updated Title");
    });

    it("should update phase and create history entry", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });

      assert.strictEqual(created.history.length, 1);

      const updated = ticketStore.updateTicket(projectId, created.id, {
        phase: "Refinement",
      });

      assert.strictEqual(updated?.phase, "Refinement");
      assert.strictEqual(updated?.history.length, 2);
      assert.strictEqual(updated?.history[0].phase, "Ideas");
      assert.ok(updated?.history[0].endedAt); // Previous phase should be closed
      assert.strictEqual(updated?.history[1].phase, "Refinement");
      assert.strictEqual(updated?.history[1].endedAt, undefined); // Current phase open
    });

    it("should return null for non-existent ticket", () => {
      const result = ticketStore.updateTicket(projectId, "NON-EXISTENT", {
        title: "Test",
      });
      assert.strictEqual(result, null);
    });

    it("should set updatedAt timestamp on update", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });

      const updated = ticketStore.updateTicket(projectId, created.id, {
        title: "Updated",
      });

      assert.ok(updated);
      assert.ok(updated.updatedAt);
      // Verify it's a valid ISO timestamp
      assert.ok(!isNaN(Date.parse(updated.updatedAt)));
    });
  });

  describe("deleteTicket", () => {
    it("should delete existing ticket", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });

      const deleted = ticketStore.deleteTicket(projectId, created.id);
      assert.strictEqual(deleted, true);

      const ticket = ticketStore.getTicket(projectId, created.id);
      assert.strictEqual(ticket, null);
    });

    it("should return false for non-existent ticket", () => {
      const deleted = ticketStore.deleteTicket(projectId, "NON-EXISTENT");
      assert.strictEqual(deleted, false);
    });

    it("should cascade delete history", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.deleteTicket(projectId, ticket.id);

      // Verify cascade deletion
      const historyRows = db
        .prepare("SELECT * FROM ticket_history WHERE ticket_id = ?")
        .all(ticket.id);

      assert.strictEqual(historyRows.length, 0);
    });
  });

  describe("archiveTicket", () => {
    it("should archive ticket in Done phase", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.updateTicket(projectId, created.id, { phase: "Done" });

      const archived = ticketStore.archiveTicket(projectId, created.id);

      assert.ok(archived);
      assert.strictEqual(archived.archived, true);
      assert.ok(archived.archivedAt);
    });

    it("should throw error for non-Done phase", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });

      assert.throws(() => {
        ticketStore.archiveTicket(projectId, created.id);
      }, /Only tickets in Done phase can be archived/);
    });

    it("should return null for non-existent ticket", () => {
      const result = ticketStore.archiveTicket(projectId, "NON-EXISTENT");
      assert.strictEqual(result, null);
    });
  });

  describe("restoreTicket", () => {
    it("should restore archived ticket", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.updateTicket(projectId, created.id, { phase: "Done" });
      ticketStore.archiveTicket(projectId, created.id);

      const restored = ticketStore.restoreTicket(projectId, created.id);

      assert.ok(restored);
      assert.strictEqual(restored.archived, false);
      assert.strictEqual(restored.archivedAt, undefined);
      assert.strictEqual(restored.phase, "Done");
    });

    it("should add history entry for restore", () => {
      const created = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.updateTicket(projectId, created.id, { phase: "Done" });
      ticketStore.archiveTicket(projectId, created.id);

      const before = ticketStore.getTicket(projectId, created.id)!;
      const historyBefore = before.history.length;

      const restored = ticketStore.restoreTicket(projectId, created.id);

      assert.strictEqual(restored!.history.length, historyBefore + 1);
      assert.strictEqual(
        restored!.history[restored!.history.length - 1].phase,
        "Done"
      );
    });
  });

  describe("History Queries", () => {
    it("should get all history entries", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.updateTicket(projectId, ticket.id, { phase: "Refinement" });
      ticketStore.updateTicket(projectId, ticket.id, { phase: "Backlog" });

      const history = ticketStore.getTicketHistory(ticket.id);

      assert.strictEqual(history.length, 3);
      assert.strictEqual(history[0].phase, "Ideas");
      assert.strictEqual(history[1].phase, "Refinement");
      assert.strictEqual(history[2].phase, "Backlog");
    });

    it("should get current history entry", () => {
      const ticket = ticketStore.createTicket(projectId, { title: "Test" });
      ticketStore.updateTicket(projectId, ticket.id, { phase: "Refinement" });

      const current = ticketStore.getCurrentHistoryEntry(ticket.id);

      assert.ok(current);
      assert.strictEqual(current.entry.phase, "Refinement");
      assert.strictEqual(current.entry.endedAt, undefined);
    });

    it("should return null for ticket with no open history", () => {
      // This shouldn't happen in practice, but test the edge case
      const current = ticketStore.getCurrentHistoryEntry("NON-EXISTENT");
      assert.strictEqual(current, null);
    });
  });
});
