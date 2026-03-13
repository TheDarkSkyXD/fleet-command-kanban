import type { Express, Request, Response } from 'express';
import { eventBus } from '../../utils/event-bus.js';
import {
  listBrainstorms,
  getBrainstorm,
  createBrainstorm,
  updateBrainstorm,
  deleteBrainstorm,
} from '../../stores/brainstorm.store.js';
import { writeResponse, readQuestion } from '../../stores/chat.store.js';
import { getMessages, addMessage, answerQuestion, getPendingQuestion } from '../../stores/conversation.store.js';
import { getActiveSessionForBrainstorm } from '../../stores/session.store.js';
import { summarizeToTitle } from '../../services/summarize.js';
import type { SessionService } from '../../services/session/index.js';
import type { Project } from '../../types/config.types.js';

export function registerBrainstormRoutes(
  app: Express,
  sessionService: SessionService,
  getProjects: () => Map<string, Project>
): void {
  // List brainstorms
  app.get('/api/brainstorms/:project', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstorms = await listBrainstorms(projectId);

      // Enrich with session status for UI spinner logic
      const enriched = brainstorms.map((b) => ({
        ...b,
        hasActiveSession: getActiveSessionForBrainstorm(b.id) !== null,
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get brainstorm
  app.get('/api/brainstorms/:project/:id', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;
      const brainstorm = await getBrainstorm(projectId, brainstormId);
      res.json(brainstorm);
    } catch (error) {
      res.status(404).json({ error: 'Brainstorm not found' });
    }
  });

  // Create brainstorm
  app.post('/api/brainstorms/:project', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const projects = getProjects();
      const project = projects.get(projectId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const { name, initialMessage } = req.body as { name?: string; initialMessage?: string };

      // Create brainstorm with default name immediately
      const brainstorm = await createBrainstorm(projectId, { name });

      // Persist initial message to conversation history
      if (initialMessage && brainstorm.conversationId) {
        addMessage(brainstorm.conversationId, {
          type: 'user',
          text: initialMessage,
        });
      }

      const sessionId = await sessionService.spawnForBrainstorm(
        projectId,
        brainstorm.id,
        project.path,
        initialMessage
      );

      // Session is tracked in sessions table now, no need to update brainstorm
      eventBus.emit('brainstorm:created', { projectId, brainstorm });

      // Generate title in background if initial message provided and no custom name
      if (!name && initialMessage) {
        summarizeToTitle(initialMessage)
          .then(async (title) => {
            const renamed = await updateBrainstorm(projectId, brainstorm.id, { name: title });
            eventBus.emit('brainstorm:updated', { projectId, brainstorm: renamed });
          })
          .catch((err) => {
            console.error('[brainstorm] Failed to generate title:', err);
          });
      }

      res.json({ brainstorm, sessionId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update brainstorm
  app.put('/api/brainstorms/:project/:id', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;
      const updates = req.body;

      const brainstorm = await updateBrainstorm(projectId, brainstormId, updates);

      eventBus.emit('brainstorm:updated', { projectId, brainstorm });

      res.json(brainstorm);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete brainstorm
  app.delete('/api/brainstorms/:project/:id', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;

      await deleteBrainstorm(projectId, brainstormId);

      eventBus.emit('brainstorm:deleted', { projectId, brainstormId });

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Submit user input
  app.post('/api/brainstorms/:project/:id/input', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;
      const { message } = req.body as { message?: string };

      if (!message) {
        res.status(400).json({ error: 'Missing message' });
        return;
      }

      // Write response file for session to pick up
      writeResponse(projectId, brainstormId, { answer: message });

      // Save user message to conversation store (askAsync doesn't wait, so we save here)
      const brainstorm = await getBrainstorm(projectId, brainstormId);
      if (brainstorm?.conversationId) {
        // Mark pending question as answered
        const pendingQuestion = getPendingQuestion(brainstorm.conversationId);
        if (pendingQuestion) {
          answerQuestion(pendingQuestion.id);
        }

        // Save user's response
        addMessage(brainstorm.conversationId, {
          type: 'user',
          text: message,
        });

        // Note: No SSE emit here - frontend already shows message optimistically
        // SSE is only needed for cross-client updates (e.g., Telegram via handleResponse)
      }

      // Always spawn a new session - with exit-on-question, there's no active session
      const projects = getProjects();
      const project = projects.get(projectId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const sessionId = await sessionService.spawnForBrainstorm(
        projectId,
        brainstormId,
        project.path
      );
      console.log(`[input] Spawned session ${sessionId} to continue brainstorm`);

      res.json({ ok: true, sessionId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Resume brainstorm
  app.post('/api/brainstorms/:project/:id/resume', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;
      const projects = getProjects();
      const project = projects.get(projectId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const brainstorm = await getBrainstorm(projectId, brainstormId);

      if (brainstorm.status === 'completed') {
        res.status(400).json({ error: 'Brainstorm is completed' });
        return;
      }

      const activeSession = getActiveSessionForBrainstorm(brainstormId);
      if (activeSession && sessionService.isActive(activeSession.id)) {
        res.json({ brainstorm, sessionId: activeSession.id, resumed: false });
        return;
      }

      const sessionId = await sessionService.spawnForBrainstorm(
        projectId,
        brainstormId,
        project.path
      );

      res.json({ brainstorm, sessionId, resumed: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get pending question
  app.get('/api/brainstorms/:project/:id/pending', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;

      const question = readQuestion(projectId, brainstormId);

      res.json({ question });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get message history
  app.get('/api/brainstorms/:project/:id/messages', async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const brainstormId = req.params.id;

      const brainstorm = await getBrainstorm(projectId, brainstormId);

      if (!brainstorm.conversationId) {
        res.json({ messages: [] });
        return;
      }

      const rawMessages = getMessages(brainstorm.conversationId);

      // Map message id to conversationId for frontend compatibility
      // The frontend uses conversationId for deduplication
      // Also extract artifact from metadata for artifact messages
      const messages = rawMessages.map((msg) => ({
        ...msg,
        conversationId: msg.id, // Use message ID as conversationId for frontend
        artifact: msg.metadata?.artifact as { filename: string; description?: string } | undefined,
      }));

      res.json({ messages });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}
