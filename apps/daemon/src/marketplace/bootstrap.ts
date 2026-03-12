// src/marketplace/bootstrap.ts
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { findClaudeBinary, getClaudeSpawnEnv } from '../utils/claude-path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MARKETPLACE_NAME = 'fleet-command-marketplace';
const PLUGIN_NAME = 'fleet-command';
const MARKETPLACE_DIR = path.join(os.homedir(), '.fleet-command', 'marketplace');
const CLAUDE_CACHE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cache', MARKETPLACE_NAME);

interface CommandResult {
  stdout: string;
  stderr: string;
}

function getClaudePath(): string | null {
  try {
    return findClaudeBinary();
  } catch {
    return null;
  }
}

function runClaudeCommand(claudePath: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, args, { stdio: 'pipe', env: getClaudeSpawnEnv() });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data;
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data;
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Bootstrap the fleet-command marketplace on daemon startup.
 * This ensures the latest marketplace is always installed:
 * 1. Delete old ~/.fleet-command/marketplace folder
 * 2. Copy templates/marketplace/ to ~/.fleet-command/marketplace
 * 3. Uninstall old marketplace from Claude (including cache)
 * 4. Install marketplace and plugin from local path
 */
export async function bootstrapMarketplace(): Promise<void> {
  console.log('[marketplace] Bootstrapping marketplace...');

  // Step 1: Always copy marketplace to ~/.fleet-command/marketplace (doesn't require Claude CLI)
  if (existsSync(MARKETPLACE_DIR)) {
    console.log('[marketplace] Removing old marketplace directory...');
    rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
  }

  // Path to bundled marketplace (relative to compiled dist/marketplace/)
  const bundledMarketplace = path.join(__dirname, '..', '..', 'templates', 'marketplace');

  if (!existsSync(bundledMarketplace)) {
    console.log(`[marketplace] No bundled marketplace found at ${bundledMarketplace}`);
    return;
  }

  console.log('[marketplace] Copying fresh marketplace from templates...');
  await copyDirectoryRecursive(bundledMarketplace, MARKETPLACE_DIR);
  console.log(`[marketplace] Marketplace copied to ${MARKETPLACE_DIR}`);

  // Step 2: Install plugin to Claude CLI (requires Claude CLI)
  const claudePath = getClaudePath();
  if (!claudePath) {
    console.log('[marketplace] Claude CLI not found, skipping plugin installation');
    console.log('[marketplace] Install Claude CLI and restart daemon to enable skills');
    return;
  }

  // Uninstall old marketplace (plugin first, then marketplace)
  const pluginId = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

  try {
    console.log('[marketplace] Uninstalling old plugin...');
    await runClaudeCommand(claudePath, ['plugin', 'uninstall', pluginId]);
    console.log('[marketplace] Old plugin uninstalled');
  } catch {
    // Plugin may not have been installed
  }

  try {
    console.log('[marketplace] Removing old marketplace...');
    await runClaudeCommand(claudePath, ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
    console.log('[marketplace] Old marketplace removed');
  } catch {
    // Marketplace may not have been installed
  }

  // Clear Claude's marketplace cache
  if (existsSync(CLAUDE_CACHE_DIR)) {
    console.log('[marketplace] Clearing marketplace cache...');
    rmSync(CLAUDE_CACHE_DIR, { recursive: true, force: true });
  }

  // Install marketplace from local path and install plugin
  try {
    console.log('[marketplace] Installing marketplace from local path...');
    await runClaudeCommand(claudePath, ['plugin', 'marketplace', 'add', MARKETPLACE_DIR]);
    console.log('[marketplace] Marketplace installed');
  } catch (err) {
    const errorMsg = (err as Error).message;
    if (errorMsg.includes('already installed') || errorMsg.includes('already exists')) {
      console.log('[marketplace] Marketplace already installed');
    } else {
      console.error(`[marketplace] Failed to install marketplace: ${errorMsg}`);
      return;
    }
  }

  try {
    console.log('[marketplace] Installing fleet-command plugin...');
    await runClaudeCommand(claudePath, ['plugin', 'install', pluginId]);
    console.log('[marketplace] Plugin installed');
  } catch (err) {
    const errorMsg = (err as Error).message;
    if (errorMsg.includes('already installed')) {
      console.log('[marketplace] Plugin already installed');
    } else {
      console.error(`[marketplace] Failed to install plugin: ${errorMsg}`);
      return;
    }
  }

  console.log('[marketplace] Marketplace bootstrap complete');
}
