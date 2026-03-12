import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

import { runMigrations } from "../migrations.js";
import { createProjectStore } from "../project.store.js";
import { createTicketStore, TicketStore } from "../ticket.store.js";
import { createTaskStore, TaskStore } from "../task.store.js";

describe("TaskStore", () => {
  let db: Database.Database;
  let taskStore: TaskStore;
  let ticketStore: TicketStore;
  let testDbPath: string;
  let projectId: string;
  let ticketId: string;

  before(() => {
    testDbPath = path.join(os.tmpdir(), `fc-task-test-${Date.now()}.db`);
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
    taskStore = createTaskStore(db);
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
    db.prepare("DELETE FROM task_comments").run();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();

    // Create a fresh ticket for each test
    const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });
    ticketId = ticket.id;
  });

  describe("createTask", () => {
    it("should create task with UUID and auto-incrementing display_number", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      // UUID format check
      assert.ok(task.id);
      assert.match(task.id, /^[0-9a-f-]{36}$/i);

      assert.strictEqual(task.displayNumber, 1);
      assert.strictEqual(task.ticketId, ticketId);
      assert.strictEqual(task.phase, "Ideas");
      assert.strictEqual(task.description, "Test task");
      assert.strictEqual(task.status, "pending");
      assert.strictEqual(task.attemptCount, 0);
      assert.ok(task.createdAt);
      assert.ok(task.updatedAt);
    });

    it("should increment display_number for same ticket", () => {
      const task1 = taskStore.createTask(ticketId, "Ideas", {
        description: "First task",
      });
      const task2 = taskStore.createTask(ticketId, "Ideas", {
        description: "Second task",
      });
      const task3 = taskStore.createTask(ticketId, "Ideas", {
        description: "Third task",
      });

      assert.strictEqual(task1.displayNumber, 1);
      assert.strictEqual(task2.displayNumber, 2);
      assert.strictEqual(task3.displayNumber, 3);
    });

    it("should store optional body field", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Task with body",
        body: "This is the detailed body content",
      });

      assert.strictEqual(task.description, "Task with body");
      assert.strictEqual(task.body, "This is the detailed body content");
    });
  });

  describe("getTask", () => {
    it("should return null for non-existent task", () => {
      const task = taskStore.getTask("non-existent-uuid");
      assert.strictEqual(task, null);
    });

    it("should return task by ID", () => {
      const created = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      const task = taskStore.getTask(created.id);

      assert.ok(task);
      assert.strictEqual(task.id, created.id);
      assert.strictEqual(task.description, "Test task");
    });
  });

  describe("getTaskByDisplayNumber", () => {
    it("should return task by ticket and display number", () => {
      const created = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      const task = taskStore.getTaskByDisplayNumber(ticketId, created.displayNumber);

      assert.ok(task);
      assert.strictEqual(task.id, created.id);
      assert.strictEqual(task.displayNumber, created.displayNumber);
    });

    it("should return null for non-existent display number", () => {
      taskStore.createTask(ticketId, "Ideas", { description: "Task 1" });

      const task = taskStore.getTaskByDisplayNumber(ticketId, 999);
      assert.strictEqual(task, null);
    });
  });

  describe("listTasks", () => {
    it("should return empty array when no tasks", () => {
      const tasks = taskStore.listTasks(ticketId);
      assert.deepStrictEqual(tasks, []);
    });

    it("should return all tasks for ticket", () => {
      taskStore.createTask(ticketId, "Ideas", { description: "Task 1" });
      taskStore.createTask(ticketId, "Ideas", { description: "Task 2" });
      taskStore.createTask(ticketId, "Refinement", { description: "Task 3" });

      const tasks = taskStore.listTasks(ticketId);

      assert.strictEqual(tasks.length, 3);
    });

    it("should filter by phase when provided", () => {
      taskStore.createTask(ticketId, "Ideas", { description: "Ideas task" });
      taskStore.createTask(ticketId, "Refinement", { description: "Refinement task" });
      taskStore.createTask(ticketId, "Ideas", { description: "Another ideas task" });

      const ideasTasks = taskStore.listTasks(ticketId, { phase: "Ideas" });
      const refinementTasks = taskStore.listTasks(ticketId, { phase: "Refinement" });

      assert.strictEqual(ideasTasks.length, 2);
      assert.strictEqual(refinementTasks.length, 1);
      assert.ok(ideasTasks.every(t => t.phase === "Ideas"));
      assert.ok(refinementTasks.every(t => t.phase === "Refinement"));
    });

    it("should order by created_at", () => {
      const task1 = taskStore.createTask(ticketId, "Ideas", { description: "First" });
      const task2 = taskStore.createTask(ticketId, "Ideas", { description: "Second" });
      const task3 = taskStore.createTask(ticketId, "Ideas", { description: "Third" });

      const tasks = taskStore.listTasks(ticketId);

      assert.strictEqual(tasks[0].id, task1.id);
      assert.strictEqual(tasks[1].id, task2.id);
      assert.strictEqual(tasks[2].id, task3.id);
    });
  });

  describe("updateTaskStatus", () => {
    it("should update status", () => {
      const created = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      const updated = taskStore.updateTaskStatus(created.id, "in_progress");

      assert.ok(updated);
      assert.strictEqual(updated.status, "in_progress");
    });

    it("should increment attempt_count on failed", () => {
      const created = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      assert.strictEqual(created.attemptCount, 0);

      const failed1 = taskStore.updateTaskStatus(created.id, "failed");
      assert.strictEqual(failed1?.attemptCount, 1);

      const failed2 = taskStore.updateTaskStatus(created.id, "failed");
      assert.strictEqual(failed2?.attemptCount, 2);
    });

    it("should reset attempt_count on completed", () => {
      const created = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      // Fail a few times
      taskStore.updateTaskStatus(created.id, "failed");
      taskStore.updateTaskStatus(created.id, "failed");

      // Complete should reset
      const completed = taskStore.updateTaskStatus(created.id, "completed");
      assert.strictEqual(completed?.attemptCount, 0);
    });

    it("should return null for non-existent task", () => {
      const result = taskStore.updateTaskStatus("non-existent", "in_progress");
      assert.strictEqual(result, null);
    });
  });

  describe("addComment", () => {
    it("should add comment to task", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      const comment = taskStore.addComment(task.id, "This is a comment");

      assert.ok(comment);
      assert.ok(comment.id);
      assert.strictEqual(comment.taskId, task.id);
      assert.strictEqual(comment.text, "This is a comment");
      assert.ok(comment.createdAt);
    });
  });

  describe("getComments", () => {
    it("should return empty array when no comments", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      const comments = taskStore.getComments(task.id);
      assert.deepStrictEqual(comments, []);
    });

    it("should return comments in order", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });

      taskStore.addComment(task.id, "First comment");
      taskStore.addComment(task.id, "Second comment");
      taskStore.addComment(task.id, "Third comment");

      const comments = taskStore.getComments(task.id);

      assert.strictEqual(comments.length, 3);
      assert.strictEqual(comments[0].text, "First comment");
      assert.strictEqual(comments[1].text, "Second comment");
      assert.strictEqual(comments[2].text, "Third comment");
    });
  });

  describe("deleteTask", () => {
    it("should delete task and its comments", () => {
      const task = taskStore.createTask(ticketId, "Ideas", {
        description: "Test task",
      });
      taskStore.addComment(task.id, "Comment 1");
      taskStore.addComment(task.id, "Comment 2");

      const deleted = taskStore.deleteTask(task.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(taskStore.getTask(task.id), null);
      assert.deepStrictEqual(taskStore.getComments(task.id), []);
    });

    it("should return false for non-existent task", () => {
      const deleted = taskStore.deleteTask("non-existent");
      assert.strictEqual(deleted, false);
    });
  });
});
