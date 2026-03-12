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
import {
  createRalphFeedbackStore,
  RalphFeedbackStore,
} from "../ralph-feedback.store.js";

describe("RalphFeedbackStore", () => {
  let db: Database.Database;
  let feedbackStore: RalphFeedbackStore;
  let ticketStore: TicketStore;
  let taskStore: TaskStore;
  let testDbPath: string;
  let projectId: string;
  let ticketId: string;
  let taskId: string;

  before(() => {
    testDbPath = path.join(
      os.tmpdir(),
      `fc-ralph-test-${Date.now()}.db`
    );
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
    feedbackStore = createRalphFeedbackStore(db);
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
    db.prepare("DELETE FROM ralph_iterations").run();
    db.prepare("DELETE FROM ralph_feedback").run();
    db.prepare("DELETE FROM task_comments").run();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM ticket_history").run();
    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM ticket_counters").run();

    // Create a fresh ticket and task for each test
    const ticket = ticketStore.createTicket(projectId, { title: "Test Ticket" });
    ticketId = ticket.id;

    const task = taskStore.createTask(ticketId, "Implementation", {
      description: "Test Task",
    });
    taskId = task.id;
  });

  describe("createFeedback", () => {
    it("should create feedback with UUID and default status", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      assert.ok(feedback.id);
      assert.match(feedback.id, /^[0-9a-f-]{36}$/i);
      assert.strictEqual(feedback.ticketId, ticketId);
      assert.strictEqual(feedback.phaseId, "implementation");
      assert.strictEqual(feedback.ralphLoopId, "loop-1");
      assert.strictEqual(feedback.taskId, undefined);
      assert.strictEqual(feedback.maxAttempts, 3);
      assert.strictEqual(feedback.status, "running");
      assert.ok(feedback.createdAt);
      assert.ok(feedback.updatedAt);
    });

    it("should create feedback with taskId", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        taskId,
        maxAttempts: 5,
      });

      assert.strictEqual(feedback.taskId, taskId);
      assert.strictEqual(feedback.maxAttempts, 5);
    });

    it("should be idempotent - return existing running feedback", () => {
      const feedback1 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      // Second call with same key should return the existing feedback
      const feedback2 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      assert.strictEqual(feedback1.id, feedback2.id);
      assert.strictEqual(feedback2.status, "running");
    });

    it("should reset terminal status to running when re-creating", () => {
      const feedback1 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      // Mark as approved (terminal state)
      feedbackStore.updateFeedbackStatus(feedback1.id, "approved");

      // Create again should reset to running
      const feedback2 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      assert.strictEqual(feedback1.id, feedback2.id);
      assert.strictEqual(feedback2.status, "running");
    });

    it("should allow same loop in different phases", () => {
      const feedback1 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const feedback2 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "review",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      assert.notStrictEqual(feedback1.id, feedback2.id);
    });

    it("should allow same loop with and without task", () => {
      const feedback1 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const feedback2 = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        taskId,
        maxAttempts: 3,
      });

      assert.notStrictEqual(feedback1.id, feedback2.id);
      assert.strictEqual(feedback1.taskId, undefined);
      assert.strictEqual(feedback2.taskId, taskId);
    });
  });

  describe("getFeedback", () => {
    it("should return null for non-existent feedback", () => {
      const feedback = feedbackStore.getFeedback("non-existent-uuid");
      assert.strictEqual(feedback, null);
    });

    it("should return feedback by id", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const feedback = feedbackStore.getFeedback(created.id);

      assert.ok(feedback);
      assert.strictEqual(feedback.id, created.id);
      assert.strictEqual(feedback.phaseId, "implementation");
    });
  });

  describe("getFeedbackForLoop", () => {
    it("should return null if no feedback exists for loop", () => {
      const feedback = feedbackStore.getFeedbackForLoop(
        ticketId,
        "implementation",
        "loop-1"
      );
      assert.strictEqual(feedback, null);
    });

    it("should return feedback for loop without task", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const feedback = feedbackStore.getFeedbackForLoop(
        ticketId,
        "implementation",
        "loop-1"
      );

      assert.ok(feedback);
      assert.strictEqual(feedback.id, created.id);
    });

    it("should return feedback for loop with task", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        taskId,
        maxAttempts: 3,
      });

      const feedback = feedbackStore.getFeedbackForLoop(
        ticketId,
        "implementation",
        "loop-1",
        taskId
      );

      assert.ok(feedback);
      assert.strictEqual(feedback.id, created.id);
      assert.strictEqual(feedback.taskId, taskId);
    });

    it("should distinguish between loop with and without task", () => {
      feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const createdWithTask = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        taskId,
        maxAttempts: 3,
      });

      // Without task should return the one without taskId
      const feedbackNoTask = feedbackStore.getFeedbackForLoop(
        ticketId,
        "implementation",
        "loop-1"
      );
      assert.strictEqual(feedbackNoTask?.taskId, undefined);

      // With task should return the one with taskId
      const feedbackWithTask = feedbackStore.getFeedbackForLoop(
        ticketId,
        "implementation",
        "loop-1",
        taskId
      );
      assert.strictEqual(feedbackWithTask?.id, createdWithTask.id);
    });
  });

  describe("updateFeedbackStatus", () => {
    it("should update status to approved", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const updated = feedbackStore.updateFeedbackStatus(created.id, "approved");

      assert.ok(updated);
      assert.strictEqual(updated.status, "approved");
      // updatedAt should be at least as recent as createdAt
      assert.ok(new Date(updated.updatedAt) >= new Date(created.createdAt));
    });

    it("should update status to rejected", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const updated = feedbackStore.updateFeedbackStatus(created.id, "rejected");

      assert.ok(updated);
      assert.strictEqual(updated.status, "rejected");
    });

    it("should update status to max_attempts", () => {
      const created = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const updated = feedbackStore.updateFeedbackStatus(created.id, "max_attempts");

      assert.ok(updated);
      assert.strictEqual(updated.status, "max_attempts");
    });

    it("should return null for non-existent feedback", () => {
      const result = feedbackStore.updateFeedbackStatus("non-existent", "approved");
      assert.strictEqual(result, null);
    });
  });

  describe("addIteration", () => {
    it("should add iteration to feedback", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const iteration = feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "Please fix the tests",
        reviewer: "user",
      });

      assert.ok(iteration);
      assert.ok(iteration.id);
      assert.match(iteration.id, /^[0-9a-f-]{36}$/i);
      assert.strictEqual(iteration.ralphFeedbackId, feedback.id);
      assert.strictEqual(iteration.iteration, 1);
      assert.strictEqual(iteration.approved, false);
      assert.strictEqual(iteration.feedback, "Please fix the tests");
      assert.strictEqual(iteration.reviewer, "user");
      assert.ok(iteration.createdAt);
    });

    it("should add approved iteration without feedback text", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const iteration = feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: true,
        reviewer: "user",
      });

      assert.ok(iteration);
      assert.strictEqual(iteration.approved, true);
      assert.strictEqual(iteration.feedback, undefined);
    });

    it("should return null for non-existent feedback", () => {
      const result = feedbackStore.addIteration("non-existent", {
        iteration: 1,
        approved: true,
        reviewer: "user",
      });
      assert.strictEqual(result, null);
    });

    it("should add multiple iterations", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "First attempt",
        reviewer: "user",
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 2,
        approved: false,
        feedback: "Second attempt",
        reviewer: "user",
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 3,
        approved: true,
        reviewer: "user",
      });

      const iterations = feedbackStore.getIterations(feedback.id);
      assert.strictEqual(iterations.length, 3);
    });
  });

  describe("getIterations", () => {
    it("should return empty array when no iterations exist", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const iterations = feedbackStore.getIterations(feedback.id);
      assert.deepStrictEqual(iterations, []);
    });

    it("should return iterations ordered by iteration number", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      // Add out of order to test sorting
      feedbackStore.addIteration(feedback.id, {
        iteration: 3,
        approved: true,
        reviewer: "user",
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "First",
        reviewer: "user",
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 2,
        approved: false,
        feedback: "Second",
        reviewer: "user",
      });

      const iterations = feedbackStore.getIterations(feedback.id);

      assert.strictEqual(iterations.length, 3);
      assert.strictEqual(iterations[0].iteration, 1);
      assert.strictEqual(iterations[1].iteration, 2);
      assert.strictEqual(iterations[2].iteration, 3);
    });

    it("should return empty array for non-existent feedback", () => {
      const iterations = feedbackStore.getIterations("non-existent");
      assert.deepStrictEqual(iterations, []);
    });
  });

  describe("getLatestIteration", () => {
    it("should return null when no iterations exist", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const latest = feedbackStore.getLatestIteration(feedback.id);
      assert.strictEqual(latest, null);
    });

    it("should return the iteration with highest iteration number", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "First",
        reviewer: "user",
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 2,
        approved: true,
        reviewer: "user",
      });

      const latest = feedbackStore.getLatestIteration(feedback.id);

      assert.ok(latest);
      assert.strictEqual(latest.iteration, 2);
      assert.strictEqual(latest.approved, true);
    });

    it("should return null for non-existent feedback", () => {
      const latest = feedbackStore.getLatestIteration("non-existent");
      assert.strictEqual(latest, null);
    });
  });

  describe("deleteFeedback", () => {
    it("should delete feedback and return true", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const deleted = feedbackStore.deleteFeedback(feedback.id);

      assert.strictEqual(deleted, true);
      assert.strictEqual(feedbackStore.getFeedback(feedback.id), null);
    });

    it("should return false for non-existent feedback", () => {
      const deleted = feedbackStore.deleteFeedback("non-existent");
      assert.strictEqual(deleted, false);
    });

    it("should cascade delete to iterations", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      const iteration = feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "Test",
        reviewer: "user",
      });

      feedbackStore.deleteFeedback(feedback.id);

      // Iterations should be gone
      const iterations = feedbackStore.getIterations(feedback.id);
      assert.deepStrictEqual(iterations, []);

      // Direct check in DB
      const row = db
        .prepare("SELECT * FROM ralph_iterations WHERE id = ?")
        .get(iteration!.id);
      assert.strictEqual(row, undefined);
    });
  });

  describe("cascade delete from parent", () => {
    it("should delete feedback when ticket is deleted", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        maxAttempts: 3,
      });

      feedbackStore.addIteration(feedback.id, {
        iteration: 1,
        approved: false,
        feedback: "Test",
        reviewer: "user",
      });

      // Delete the ticket
      ticketStore.deleteTicket(projectId, ticketId);

      // Feedback should be gone
      assert.strictEqual(feedbackStore.getFeedback(feedback.id), null);
    });

    it("should delete feedback when task is deleted", () => {
      const feedback = feedbackStore.createFeedback({
        ticketId,
        phaseId: "implementation",
        ralphLoopId: "loop-1",
        taskId,
        maxAttempts: 3,
      });

      // Delete the task
      taskStore.deleteTask(taskId);

      // Feedback should be gone
      assert.strictEqual(feedbackStore.getFeedback(feedback.id), null);
    });
  });
});
