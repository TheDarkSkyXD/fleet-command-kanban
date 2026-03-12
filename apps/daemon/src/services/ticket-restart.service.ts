import { getDatabase } from "../stores/db.js";
import { getTicket, getPhaseHistoryEntries, deleteHistoryEntries, clearWorkerState, deleteArtifactsForPhases } from "../stores/ticket.store.js";
import { deleteSessionsForPhases, getActiveSessionForTicket } from "../stores/session.store.js";
import { deleteTasksForPhases } from "../stores/task.store.js";
import { deleteRalphFeedbackForPhases } from "../stores/ralph-feedback.store.js";
import { getProjectById } from "../stores/project.store.js";
import { getPhaseConfig } from "./session/phase-config.js";
import { removeWorktreeAndRenameBranch } from "./session/worktree.js";
import type { SessionService } from "./session/index.js";
import type { Ticket } from "../types/ticket.types.js";

export interface RestartResult {
  success: boolean;
  ticket: Ticket;
  sessionSpawned: boolean;
  cleanup: {
    sessionsDeleted: number;
    tasksDeleted: number;
    feedbackDeleted: number;
    artifactsDeleted: number;
    historyEntriesDeleted: number;
    worktreeRemoved: boolean;
    branchRenamed: string | null;
  };
}

/**
 * Restart a ticket to a target phase, discarding all work from that phase onwards.
 */
export async function restartToPhase(
  projectId: string,
  ticketId: string,
  targetPhase: string,
  sessionService: SessionService
): Promise<RestartResult> {
  // 1. Get the ticket and validate
  const ticket = getTicket(projectId, ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  if (ticket.archived) {
    throw new Error(`Cannot restart archived ticket ${ticketId}`);
  }

  // 2. Get phase history and find target phase entry
  const historyEntries = getPhaseHistoryEntries(ticketId);
  const targetEntry = historyEntries.find(entry => entry.phase === targetPhase);
  if (!targetEntry) {
    throw new Error(`Target phase ${targetPhase} not found in ticket history`);
  }

  // 3. Find all phases to reset (target phase and everything after)
  const targetIndex = historyEntries.findIndex(entry => entry.id === targetEntry.id);
  const entriesToDelete = historyEntries.slice(targetIndex);
  const phasesToReset = [...new Set(entriesToDelete.map(e => e.phase))];
  const historyIdsToDelete = entriesToDelete.map(e => e.id);

  console.log(`[restart] Restarting ticket ${ticketId} to phase ${targetPhase}`);
  console.log(`[restart] Phases to reset: ${phasesToReset.join(', ')}`);

  // 4. Stop any active sessions for this ticket
  const activeSession = getActiveSessionForTicket(ticketId);
  if (activeSession && sessionService.isActive(activeSession.id)) {
    console.log(`[restart] Stopping active session ${activeSession.id}`);
    await sessionService.stopSession(activeSession.id);
  }

  // 5. Delete data for affected phases
  const sessionsDeleted = deleteSessionsForPhases(ticketId, phasesToReset);
  const tasksDeleted = deleteTasksForPhases(ticketId, phasesToReset);
  const feedbackDeleted = deleteRalphFeedbackForPhases(ticketId, phasesToReset);
  const artifactsDeleted = await deleteArtifactsForPhases(projectId, ticketId, phasesToReset);
  const historyEntriesDeleted = deleteHistoryEntries(historyIdsToDelete);

  console.log(`[restart] Deleted: ${sessionsDeleted} sessions, ${tasksDeleted} tasks, ${feedbackDeleted} feedback, ${artifactsDeleted} artifacts, ${historyEntriesDeleted} history entries`);

  // 6. Clear worker state
  clearWorkerState(ticketId);

  // 7. Get project and handle worktree/branch
  const project = getProjectById(projectId);
  let worktreeRemoved = false;
  let branchRenamed: string | null = null;

  // Remove worktree and rename branch to preserve commits
  // The branch is renamed to fleet-resets/{ticketId}-{timestamp}
  if (project) {
    const worktreeResult = await removeWorktreeAndRenameBranch(project.path, ticketId);
    worktreeRemoved = worktreeResult.worktreeRemoved;
    branchRenamed = worktreeResult.newBranchName;

    if (worktreeResult.errors.length > 0) {
      console.warn(`[restart] Worktree cleanup warnings: ${worktreeResult.errors.join(", ")}`);
    }
    if (worktreeRemoved) {
      console.log(`[restart] Removed worktree for ${ticketId}`);
    }
    if (branchRenamed) {
      console.log(`[restart] Renamed branch to ${branchRenamed}`);
    }
  }

  // 8. Update ticket phase and create new history entry
  const now = new Date().toISOString();
  const db = getDatabase();

  // Create new history entry for target phase
  const historyId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO ticket_history (id, ticket_id, phase, entered_at)
     VALUES (?, ?, ?, ?)`
  ).run(historyId, ticketId, targetPhase, now);

  // Update ticket phase and clear worker state
  db.prepare(
    `UPDATE tickets SET phase = ?, worker_state = NULL, updated_at = ? WHERE id = ?`
  ).run(targetPhase, now, ticketId);

  // 9. Get updated ticket
  const updatedTicket = getTicket(projectId, ticketId)!;

  // 10. Auto-spawn session if target phase has automation (workers defined)
  let sessionSpawned = false;
  if (project) {
    const phaseConfig = await getPhaseConfig(projectId, targetPhase);
    const hasAutomation = phaseConfig?.workers && phaseConfig.workers.length > 0;

    if (hasAutomation) {
      try {
        console.log(`[restart] Auto-spawning session for phase ${targetPhase}`);
        await sessionService.spawnForTicket(projectId, ticketId, targetPhase, project.path);
        sessionSpawned = true;
      } catch (error) {
        console.error(`[restart] Failed to spawn session: ${(error as Error).message}`);
      }
    }
  }

  return {
    success: true,
    ticket: updatedTicket,
    sessionSpawned,
    cleanup: {
      sessionsDeleted,
      tasksDeleted,
      feedbackDeleted,
      artifactsDeleted,
      historyEntriesDeleted,
      worktreeRemoved,
      branchRenamed,
    },
  };
}
