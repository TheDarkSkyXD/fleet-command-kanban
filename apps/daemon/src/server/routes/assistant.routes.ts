import type { Express, Request, Response } from 'express';
import {
  getOrCreateAssistant,
  AssistantStore,
} from '../../stores/assistant.store.js';
import { writeResponse } from '../../stores/chat.store.js';
import {
  getMessages,
  addMessage,
  answerQuestion,
  getPendingQuestion,
  getConversationsByAssistant,
  updateConversationTitle,
  getMessageCount,
  deleteConversation,
  createConversationStore,
} from '../../stores/conversation.store.js';
import { getActiveSessionForAssistant } from '../../stores/session.store.js';
import { getDatabase } from '../../stores/db.js';
import { summarizeToTitle } from '../../services/summarize.js';
import type { SessionService } from '../../services/session/index.js';
import type { Project } from '../../types/config.types.js';

function buildWelcomeMessage(projectName: string): string {
  return [
    `👋 Hey! I'm your **${projectName}** project assistant. I can help you with:`,
    '',
    '**Exploring the codebase** — architecture, patterns, how things work  ',
    '**Managing tickets & tasks** — creating, tracking, and organizing work  ',
    '**Answering questions** — about features, APIs, components, and more',
    '',
    'How can I help you today?',
  ].join('\n');
}

const welcomeOptions = [
  'Explore the codebase',
  'Manage tickets & tasks',
  'Ask a question',
  'What can you do?',
];

// Prevents duplicate session spawns from concurrent requests (React strict mode, rapid clicks)
const startingSessionLock = new Set<string>();

export function registerAssistantRoutes(
  app: Express,
  sessionService: SessionService,
  getProjects: () => Map<string, Project>
): void {
  // Resolve project param (could be ID or slug) to actual project ID
  function resolveProjectId(param: string): string | null {
    const projectId = decodeURIComponent(param);
    const projects = getProjects();
    // Try direct ID match first
    if (projects.has(projectId)) return projectId;
    // Try slug match
    for (const [id, project] of projects) {
      if (project.slug === projectId) return id;
    }
    return null;
  }

  // Get or create assistant for project
  app.get('/api/assistant/:project', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const assistant = getOrCreateAssistant(projectId);

      // Seed welcome message for brand new assistants (no messages yet)
      if (assistant.conversationId) {
        const existingMessages = getMessages(assistant.conversationId);
        if (existingMessages.length === 0) {
          const projects = getProjects();
          const project = projects.get(projectId);
          const projectName = project?.displayName || projectId;
          addMessage(assistant.conversationId, {
            type: 'question',
            text: buildWelcomeMessage(projectName),
            options: welcomeOptions,
          });
        }
      }

      const hasActiveSession = getActiveSessionForAssistant(assistant.id) !== null;
      res.json({ ...assistant, hasActiveSession });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Start a session for the assistant (auto-greet on panel open or new thread)
  app.post('/api/assistant/:project/start-session', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const projects = getProjects();
      const project = projects.get(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const assistant = getOrCreateAssistant(projectId);

      // Don't spawn if there's already an active session
      const activeSession = getActiveSessionForAssistant(assistant.id);
      if (activeSession && sessionService.isActive(activeSession.id)) {
        res.json({ ok: true, sessionId: activeSession.id, assistantId: assistant.id, alreadyActive: true });
        return;
      }

      // Prevent duplicate spawns from concurrent requests
      if (startingSessionLock.has(assistant.id)) {
        res.json({ ok: true, assistantId: assistant.id, alreadyActive: true });
        return;
      }
      startingSessionLock.add(assistant.id);

      try {
        // Clear any stale pending questions so they don't block the new session
        if (assistant.conversationId) {
          const pending = getPendingQuestion(assistant.conversationId);
          if (pending) {
            answerQuestion(pending.id);
          }
        }

        // Spawn session — agent will greet the user
        const sessionId = await sessionService.spawnForAssistant(
          projectId,
          assistant.id,
          project.path
        );

        res.json({ ok: true, sessionId, assistantId: assistant.id });
      } finally {
        startingSessionLock.delete(assistant.id);
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Send message to assistant
  app.post('/api/assistant/:project/message', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const { message, conversationId: requestedConversationId } = req.body as {
        message?: string;
        conversationId?: string;
      };

      if (!message) {
        res.status(400).json({ error: 'Missing message' });
        return;
      }

      const projects = getProjects();
      const project = projects.get(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const assistant = getOrCreateAssistant(projectId);

      // Use requested conversationId or fall back to assistant's active conversation
      const conversationId = requestedConversationId || assistant.conversationId;
      if (!conversationId) {
        res.status(500).json({ error: 'Assistant has no conversation' });
        return;
      }

      // If using a different conversation than the active one, switch
      if (conversationId !== assistant.conversationId) {
        const store = new AssistantStore(getDatabase());
        store.switchConversation(assistant.id, conversationId);
      }

      // Check if there's a pending question to answer
      const pendingQuestion = getPendingQuestion(conversationId);

      if (pendingQuestion) {
        writeResponse(projectId, assistant.id, { answer: message });
        answerQuestion(pendingQuestion.id);
      }

      // Save user message
      addMessage(conversationId, {
        type: 'user',
        text: message,
      });

      // Auto-title the conversation from the first substantial user message
      const convStore = createConversationStore(getDatabase());
      const conversation = convStore.getConversation(conversationId);
      if (conversation && !conversation.title && message.trim().length > 10) {
        summarizeToTitle(message)
          .then((title) => {
            updateConversationTitle(conversationId, title);
          })
          .catch((err) => {
            console.error('[assistant] Failed to generate title:', err);
          });
      }

      // Pass initialMessage only when there's no pending question.
      const sessionId = await sessionService.spawnForAssistant(
        projectId,
        assistant.id,
        project.path,
        pendingQuestion ? undefined : message
      );

      res.json({ ok: true, sessionId, assistantId: assistant.id });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get message history for a specific conversation or the active one
  app.get('/api/assistant/:project/messages', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const requestedConversationId = req.query.conversationId as string | undefined;
      const assistant = getOrCreateAssistant(projectId);

      const conversationId = requestedConversationId || assistant.conversationId;
      if (!conversationId) {
        res.json({ messages: [] });
        return;
      }

      const rawMessages = getMessages(conversationId);
      const messages = rawMessages.map((msg) => ({
        ...msg,
        conversationId: msg.id,
        artifact: msg.metadata?.artifact as { filename: string; description?: string } | undefined,
      }));

      res.json({ messages });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get pending question
  app.get('/api/assistant/:project/pending', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const assistant = getOrCreateAssistant(projectId);

      if (!assistant.conversationId) {
        res.json({ question: null });
        return;
      }

      const question = getPendingQuestion(assistant.conversationId);
      res.json({ question });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // List conversation threads
  app.get('/api/assistant/:project/threads', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const assistant = getOrCreateAssistant(projectId);

      const conversations = getConversationsByAssistant(assistant.id);

      // Enrich with message count and active status
      const threads = conversations.map((conv) => ({
        id: conv.id,
        title: conv.title || 'New Conversation',
        messageCount: getMessageCount(conv.id),
        isActive: conv.id === assistant.conversationId,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }));

      res.json({ threads, activeConversationId: assistant.conversationId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create new conversation thread
  app.post('/api/assistant/:project/new-thread', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const projects = getProjects();
      const project = projects.get(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const assistant = getOrCreateAssistant(projectId);

      // Create a new conversation linked to the assistant
      const convStore = createConversationStore(getDatabase());
      const conversation = convStore.createConversation(projectId, {
        assistantId: assistant.id,
      });

      // Switch the assistant to use the new conversation
      const store = new AssistantStore(getDatabase());
      store.switchConversation(assistant.id, conversation.id);

      // Seed the welcome message immediately — no session needed for greeting
      const projectName = project.displayName || projectId;
      addMessage(conversation.id, {
        type: 'question',
        text: buildWelcomeMessage(projectName),
        options: welcomeOptions,
      });

      res.json({
        conversationId: conversation.id,
        assistantId: assistant.id,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete a conversation thread
  app.delete('/api/assistant/:project/threads/:conversationId', async (req: Request, res: Response) => {
    try {
      const projectId = resolveProjectId(req.params.project);
      if (!projectId) { res.status(404).json({ error: 'Project not found' }); return; }
      const conversationId = req.params.conversationId;
      const assistant = getOrCreateAssistant(projectId);

      // Don't allow deleting the last conversation
      const threads = getConversationsByAssistant(assistant.id);
      if (threads.length <= 1) {
        res.status(400).json({ error: 'Cannot delete the last conversation' });
        return;
      }

      // If deleting the active conversation, switch to another one
      let newActiveConversationId: string | null = null;
      if (assistant.conversationId === conversationId) {
        const other = threads.find(t => t.id !== conversationId);
        if (other) {
          newActiveConversationId = other.id;
          const store = new AssistantStore(getDatabase());
          store.switchConversation(assistant.id, other.id);
        }
      }

      // Delete the conversation (CASCADE deletes messages)
      deleteConversation(conversationId);

      res.json({ ok: true, newActiveConversationId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}
