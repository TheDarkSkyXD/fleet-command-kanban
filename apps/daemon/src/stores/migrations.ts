import type Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 7;

/**
 * Run database migrations.
 * Uses SQLite's user_version pragma to track schema version.
 */
export function runMigrations(db: Database.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    migrateV1(db);
  }

  if (version < 2) {
    migrateV2(db);
  }

  if (version < 3) {
    migrateV3(db);
  }

  if (version < 4) {
    migrateV4(db);
  }

  if (version < 5) {
    migrateV5(db);
  }

  if (version < 6) {
    migrateV6(db);
  }

  if (version < 7) {
    migrateV7(db);
  }

  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}

/**
 * V1: Initial schema - projects table
 */
function migrateV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id               TEXT PRIMARY KEY,
      slug             TEXT NOT NULL UNIQUE,
      display_name     TEXT NOT NULL,
      path             TEXT NOT NULL UNIQUE,
      registered_at    TEXT NOT NULL,
      icon             TEXT,
      color            TEXT,
      template_name    TEXT,
      template_version TEXT,
      disabled_phases  TEXT,
      disabled_phase_migration INTEGER DEFAULT 0,
      swimlane_colors  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
  `);
}

/**
 * V2: Tickets, history entries, and sessions
 */
function migrateV2(db: Database.Database): void {
  db.exec(`
    -- Ticket counters for generating prefix-based IDs (e.g., POT-1, POT-2)
    CREATE TABLE IF NOT EXISTS ticket_counters (
      project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      next_number   INTEGER NOT NULL DEFAULT 1
    );

    -- Main tickets table
    CREATE TABLE IF NOT EXISTS tickets (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      phase         TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      archived      INTEGER DEFAULT 0,
      archived_at   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_phase ON tickets(project_id, phase);
    CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(project_id, archived);

    -- Ticket history entries (phase transitions)
    CREATE TABLE IF NOT EXISTS ticket_history (
      id            TEXT PRIMARY KEY,
      ticket_id     TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      phase         TEXT NOT NULL,
      entered_at    TEXT NOT NULL,
      exited_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);

    -- Ticket sessions (Claude sessions within a phase)
    CREATE TABLE IF NOT EXISTS ticket_sessions (
      id            TEXT PRIMARY KEY,
      ticket_id     TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      history_id    TEXT NOT NULL REFERENCES ticket_history(id) ON DELETE CASCADE,
      session_id    TEXT NOT NULL,
      source        TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      ended_at      TEXT,
      exit_code     INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_sessions_ticket ON ticket_sessions(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_sessions_history ON ticket_sessions(history_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_sessions_session_id ON ticket_sessions(session_id);
  `);
}

/**
 * V3: Unified conversations, sessions, and brainstorms
 */
function migrateV3(db: Database.Database): void {
  db.exec(`
    -- Conversations table (reusable chat container)
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

    -- Messages within a conversation
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      type            TEXT NOT NULL,
      text            TEXT NOT NULL,
      options         TEXT,
      timestamp       TEXT NOT NULL,
      answered_at     TEXT,
      metadata        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_pending ON conversation_messages(conversation_id, answered_at)
      WHERE type = 'question' AND answered_at IS NULL;

    -- Brainstorms table
    CREATE TABLE IF NOT EXISTS brainstorms (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      conversation_id   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      created_ticket_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_brainstorms_project ON brainstorms(project_id);
    CREATE INDEX IF NOT EXISTS idx_brainstorms_status ON brainstorms(project_id, status);

    -- Unified sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      ticket_id         TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      brainstorm_id     TEXT REFERENCES brainstorms(id) ON DELETE CASCADE,
      conversation_id   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      claude_session_id TEXT,
      agent_source      TEXT,
      started_at        TEXT NOT NULL,
      ended_at          TEXT,
      exit_code         INTEGER,
      phase             TEXT,
      metadata          TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON sessions(ticket_id) WHERE ticket_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_brainstorm ON sessions(brainstorm_id) WHERE brainstorm_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_claude ON sessions(claude_session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;

    -- Add conversation_id to tickets
    ALTER TABLE tickets ADD COLUMN conversation_id TEXT REFERENCES conversations(id);

    -- Drop old ticket_sessions table (data migrated to sessions)
    DROP TABLE IF EXISTS ticket_sessions;
  `);
}

/**
 * V4: Backfill conversation_id for existing tickets
 */
function migrateV4(db: Database.Database): void {
  // Find tickets without conversations
  const ticketsWithoutConv = db
    .prepare(
      `SELECT id, project_id FROM tickets WHERE conversation_id IS NULL`
    )
    .all() as Array<{ id: string; project_id: string }>;

  if (ticketsWithoutConv.length === 0) {
    return;
  }

  console.log(
    `[migrateV4] Backfilling ${ticketsWithoutConv.length} tickets with conversations`
  );

  const insertConv = db.prepare(
    `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
  );
  const updateTicket = db.prepare(
    `UPDATE tickets SET conversation_id = ? WHERE id = ?`
  );

  const now = new Date().toISOString();

  for (const ticket of ticketsWithoutConv) {
    const convId = crypto.randomUUID();
    insertConv.run(convId, ticket.project_id, now, now);
    updateTicket.run(convId, ticket.id);
  }

  console.log(`[migrateV4] Backfill complete`);
}

/**
 * V5: Tasks, provider channels, ralph feedback, artifacts, templates, config
 *     Plus ticket description and worker_state columns
 */
function migrateV5(db: Database.Database): void {
  // Add columns to tickets table (check if they exist first to be idempotent)
  const ticketColumns = db
    .prepare("PRAGMA table_info(tickets)")
    .all() as { name: string }[];
  const columnNames = new Set(ticketColumns.map((c) => c.name));

  if (!columnNames.has("description")) {
    db.exec(`ALTER TABLE tickets ADD COLUMN description TEXT DEFAULT ''`);
  }
  if (!columnNames.has("worker_state")) {
    db.exec(`ALTER TABLE tickets ADD COLUMN worker_state TEXT`);
  }

  // Create tables with IF NOT EXISTS to be idempotent
  db.exec(`

    -- Tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id             TEXT PRIMARY KEY,
      ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      display_number INTEGER NOT NULL,
      phase          TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      attempt_count  INTEGER NOT NULL DEFAULT 0,
      description    TEXT NOT NULL,
      body           TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      UNIQUE(ticket_id, display_number)
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_ticket ON tasks(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_ticket_phase ON tasks(ticket_id, phase);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(ticket_id, status);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

    -- Provider Channels
    CREATE TABLE IF NOT EXISTS provider_channels (
      id            TEXT PRIMARY KEY,
      ticket_id     TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      brainstorm_id TEXT REFERENCES brainstorms(id) ON DELETE CASCADE,
      provider_id   TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      metadata      TEXT,
      created_at    TEXT NOT NULL,
      CHECK ((ticket_id IS NULL) != (brainstorm_id IS NULL)),
      UNIQUE(ticket_id, provider_id),
      UNIQUE(brainstorm_id, provider_id)
    );

    CREATE INDEX IF NOT EXISTS idx_provider_channels_ticket ON provider_channels(ticket_id) WHERE ticket_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_provider_channels_brainstorm ON provider_channels(brainstorm_id) WHERE brainstorm_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_provider_channels_lookup ON provider_channels(provider_id, channel_id);

    -- Ralph Feedback
    CREATE TABLE IF NOT EXISTS ralph_feedback (
      id            TEXT PRIMARY KEY,
      ticket_id     TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      phase_id      TEXT NOT NULL,
      ralph_loop_id TEXT NOT NULL,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      max_attempts  INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'running',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      UNIQUE(ticket_id, phase_id, ralph_loop_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS ralph_iterations (
      id                TEXT PRIMARY KEY,
      ralph_feedback_id TEXT NOT NULL REFERENCES ralph_feedback(id) ON DELETE CASCADE,
      iteration         INTEGER NOT NULL,
      approved          INTEGER NOT NULL,
      feedback          TEXT,
      reviewer          TEXT NOT NULL,
      created_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ralph_feedback_ticket ON ralph_feedback(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ralph_iterations_feedback ON ralph_iterations(ralph_feedback_id);

    -- Artifacts (metadata only)
    CREATE TABLE IF NOT EXISTS artifacts (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      type        TEXT NOT NULL,
      description TEXT,
      phase       TEXT,
      file_path   TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      UNIQUE(ticket_id, filename)
    );

    CREATE TABLE IF NOT EXISTS artifact_versions (
      id          TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,
      description TEXT,
      file_path   TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      UNIQUE(artifact_id, version)
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_ticket ON artifacts(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id);

    -- Templates (registry only)
    CREATE TABLE IF NOT EXISTS templates (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      version     TEXT NOT NULL,
      description TEXT,
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_templates_default ON templates(is_default) WHERE is_default = 1;

    -- Config (key-value)
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * V6: Add branch_prefix column to projects table
 */
function migrateV6(db: Database.Database): void {
  db.exec(`ALTER TABLE projects ADD COLUMN branch_prefix TEXT DEFAULT 'potato'`);
}

/**
 * V7: Add folders table and folder_id FK on projects
 */
function migrateV7(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    ALTER TABLE projects ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
  `);
}
