export interface TelegramConfig {
  botToken: string;
  userId: string;
  forumGroupId?: string;
  mode: 'auto' | 'webhook' | 'polling';
}

export interface ProvidersConfig {
  telegram?: TelegramConfig;
  // Future providers go here
}

export interface DaemonConfig {
  port: number;
}

export interface GlobalConfig {
  // Keep old structure for backward compatibility
  telegram?: TelegramConfig;
  // New structure
  providers?: ProvidersConfig;
  daemon: DaemonConfig;
}

export interface Project {
  id: string;
  slug: string;  // URL-safe identifier
  displayName: string;
  path: string;
  registeredAt: string;
  icon?: string;
  color?: string;
  template?: {
    name: string;
    version: string; // Semver format "1.0.0"
  };
  disabledPhases?: string[];           // array of phase names that are disabled
  disabledPhaseMigration?: boolean;    // true while migration is in progress
  swimlaneColors?: Record<string, string>;  // phase name -> hex color
  branchPrefix?: string;  // Custom branch prefix (default: 'potato')
  folderId?: string | null;  // FK to folders table
}

export interface DaemonInfo {
  url: string;
  port: number;
  pid: number;
  startedAt: string;
}
