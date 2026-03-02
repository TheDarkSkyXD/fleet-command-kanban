import fs from "fs/promises";
import type Database from "better-sqlite3";
import {
  GLOBAL_DIR,
  CONFIG_FILE,
  TASKS_DIR,
  SESSIONS_DIR,
  BRAINSTORMS_DIR,
  PID_FILE,
  DAEMON_INFO_FILE,
} from "../config/paths.js";
import type {
  GlobalConfig,
  DaemonInfo,
  TelegramConfig,
  SlackConfig,
  DaemonConfig,
} from "../types/index.js";
import { getDatabase } from "./db.js";

// ============================================================================
// SQLite-backed key-value config store
// ============================================================================

interface ConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface ConfigEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface ConfigStore {
  /**
   * Get a config value by key.
   * Returns null if key doesn't exist.
   */
  get<T = unknown>(key: string): T | null;

  /**
   * Set a config value. Creates or updates the key.
   */
  set(key: string, value: unknown): void;

  /**
   * Delete a config key.
   * Returns true if key existed and was deleted, false otherwise.
   */
  delete(key: string): boolean;

  /**
   * Get all config entries as a key-value object.
   */
  getAll(): Record<string, unknown>;

  /**
   * Get Telegram configuration.
   */
  getTelegramConfig(): TelegramConfig | null;

  /**
   * Set Telegram configuration.
   */
  setTelegramConfig(config: TelegramConfig): void;

  /**
   * Get daemon configuration (port, etc).
   */
  getDaemonConfig(): DaemonConfig | null;

  /**
   * Set daemon configuration.
   */
  setDaemonConfig(config: DaemonConfig): void;

  /**
   * Get Slack configuration.
   */
  getSlackConfig(): SlackConfig | null;

  /**
   * Set Slack configuration.
   */
  setSlackConfig(config: SlackConfig): void;
}

/**
 * Create a ConfigStore instance with dependency injection for testing.
 */
export function createConfigStore(db: Database.Database): ConfigStore {
  const getStmt = db.prepare<[string], ConfigRow>(
    "SELECT key, value, updated_at FROM config WHERE key = ?"
  );

  const upsertStmt = db.prepare<[string, string, string]>(
    `INSERT INTO config (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  const deleteStmt = db.prepare<[string]>("DELETE FROM config WHERE key = ?");

  const getAllStmt = db.prepare<[], ConfigRow>(
    "SELECT key, value, updated_at FROM config"
  );

  return {
    get<T = unknown>(key: string): T | null {
      const row = getStmt.get(key);
      if (!row) return null;

      try {
        return JSON.parse(row.value) as T;
      } catch {
        // If parsing fails, return the raw string
        return row.value as unknown as T;
      }
    },

    set(key: string, value: unknown): void {
      const now = new Date().toISOString();
      const serialized = JSON.stringify(value);
      upsertStmt.run(key, serialized, now);
    },

    delete(key: string): boolean {
      const result = deleteStmt.run(key);
      return result.changes > 0;
    },

    getAll(): Record<string, unknown> {
      const rows = getAllStmt.all();
      const result: Record<string, unknown> = {};

      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }

      return result;
    },

    getTelegramConfig(): TelegramConfig | null {
      return this.get<TelegramConfig>("telegram");
    },

    setTelegramConfig(config: TelegramConfig): void {
      this.set("telegram", config);
    },

    getDaemonConfig(): DaemonConfig | null {
      return this.get<DaemonConfig>("daemon");
    },

    setDaemonConfig(config: DaemonConfig): void {
      this.set("daemon", config);
    },

    getSlackConfig(): SlackConfig | null {
      return this.get<SlackConfig>("slack");
    },

    setSlackConfig(config: SlackConfig): void {
      this.set("slack", config);
    },
  };
}

// Singleton instance
let configStoreInstance: ConfigStore | null = null;

/**
 * Get the singleton ConfigStore instance.
 * Must call initDatabase() first.
 */
export function getConfigStore(): ConfigStore {
  if (!configStoreInstance) {
    configStoreInstance = createConfigStore(getDatabase());
  }
  return configStoreInstance;
}

// ============================================================================
// File-based config (legacy, kept for backward compatibility)
// ============================================================================

const DEFAULT_CONFIG: GlobalConfig = {
  telegram: {
    botToken: "",
    userId: "",
    forumGroupId: "",
    mode: "auto",
  },
  daemon: {
    port: 8443,
  },
};

export async function ensureGlobalDir(): Promise<void> {
  await fs.mkdir(GLOBAL_DIR, { recursive: true });
  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(BRAINSTORMS_DIR, { recursive: true });
}

export async function loadGlobalConfig(): Promise<GlobalConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data) as GlobalConfig;

    // Migrate old telegram config to providers.telegram
    if (config && config.telegram && !config.providers?.telegram) {
      config.providers = config.providers || {};
      config.providers.telegram = config.telegram;
    }

    return config;
  } catch {
    return null;
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureGlobalDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function createDefaultConfig(): Promise<GlobalConfig> {
  await saveGlobalConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

// ============================================================================
// Daemon runtime files (PID, info) - always file-based
// ============================================================================

export async function readPid(): Promise<number | null> {
  try {
    const pid = await fs.readFile(PID_FILE, "utf-8");
    return parseInt(pid.trim(), 10);
  } catch {
    return null;
  }
}

export async function writePid(pid: number): Promise<void> {
  await ensureGlobalDir();
  await fs.writeFile(PID_FILE, String(pid));
}

export async function removePid(): Promise<void> {
  try {
    await fs.unlink(PID_FILE);
  } catch {
    // Ignore
  }
}

export async function writeDaemonInfo(info: DaemonInfo): Promise<void> {
  await ensureGlobalDir();
  await fs.writeFile(DAEMON_INFO_FILE, JSON.stringify(info, null, 2));
}

export async function readDaemonInfo(): Promise<DaemonInfo | null> {
  try {
    const data = await fs.readFile(DAEMON_INFO_FILE, "utf-8");
    return JSON.parse(data) as DaemonInfo;
  } catch {
    return null;
  }
}

export async function removeDaemonInfo(): Promise<void> {
  try {
    await fs.unlink(DAEMON_INFO_FILE);
  } catch {
    // Ignore
  }
}
