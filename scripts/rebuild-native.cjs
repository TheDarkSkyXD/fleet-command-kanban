/**
 * Rebuild native modules (better-sqlite3) for Node.js or Electron.
 *
 * Usage:
 *   node scripts/rebuild-native.cjs node      # Rebuild for Node.js
 *   node scripts/rebuild-native.cjs electron   # Rebuild for Electron
 *
 * Stops the daemon first if it's running (the .node file is locked while in use).
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const target = process.argv[2] || "node";

// Stop daemon first — the .node binary is locked while in use
const pidFile = path.join(os.homedir(), ".fleet-command", "daemon.pid");
if (fs.existsSync(pidFile)) {
  const pid = fs.readFileSync(pidFile, "utf-8").trim();
  console.log(`Stopping daemon (PID ${pid}) before rebuild...`);
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(Number(pid), "SIGTERM");
    }
  } catch {
    // Already dead
  }
  // Clean up lock files
  const lockDir = path.join(os.homedir(), ".fleet-command");
  for (const f of ["daemon.pid", "daemon.lock", "daemon.lock.lock"]) {
    const p = path.join(lockDir, f);
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else {
        fs.unlinkSync(p);
      }
    } catch {
      // doesn't exist
    }
  }
  // Brief pause for file handles to release
  execSync(
    process.platform === "win32"
      ? "ping -n 2 127.0.0.1 >nul"
      : "sleep 1",
    { stdio: "ignore" }
  );
}

if (target === "electron") {
  console.log("Rebuilding native modules for Electron...");
  execSync("npx electron-rebuild -f -w better-sqlite3", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
} else {
  console.log("Rebuilding native modules for Node.js...");
  const sqlitePath = path.dirname(
    require.resolve("better-sqlite3/package.json")
  );
  execSync("npx node-gyp rebuild", {
    stdio: "inherit",
    cwd: sqlitePath,
  });
}

console.log(`\nRebuild complete (target: ${target})`);
