/**
 * Desktop dev launcher.
 * Starts the frontend Vite dev server, waits for it, then launches Electron.
 * The daemon is started by Electron's main process internally.
 * Cleans up all child processes on exit.
 */

const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DESKTOP = path.resolve(__dirname, "..");
const VITE_PORT = 5173;

let viteProc = null;
let electronProc = null;
let exiting = false;

function cleanup() {
  if (exiting) return;
  exiting = true;

  if (electronProc && !electronProc.killed) {
    electronProc.kill();
  }
  if (viteProc && !viteProc.killed) {
    // On Windows, kill the process tree
    if (process.platform === "win32" && viteProc.pid) {
      try {
        execSync(`taskkill /T /F /PID ${viteProc.pid}`, { stdio: "ignore" });
      } catch {}
    } else {
      viteProc.kill();
    }
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout waiting for port ${port}`));
      }
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(check, 500));
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, 500);
      });
    }
    check();
  });
}

async function main() {
  // 1. Start frontend Vite dev server
  console.log("[dev] Starting frontend Vite dev server...");
  viteProc = spawn("pnpm", ["--filter", "@fleet-command/frontend", "dev"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  viteProc.stdout.on("data", (d) => {
    const line = d.toString();
    if (line.trim()) process.stdout.write(`[vite] ${line}`);
  });
  viteProc.stderr.on("data", (d) => {
    const line = d.toString();
    if (line.trim()) process.stderr.write(`[vite] ${line}`);
  });
  viteProc.on("exit", (code) => {
    if (!exiting) {
      console.error(`[dev] Vite exited unexpectedly (code ${code})`);
      cleanup();
    }
  });

  // 2. Wait for Vite to be ready
  console.log("[dev] Waiting for Vite dev server on port", VITE_PORT, "...");
  await waitForPort(VITE_PORT);
  console.log("[dev] Vite dev server ready.");

  // 3. Build Electron main/preload
  console.log("[dev] Building Electron main/preload...");
  execSync("npx electron-vite build", { cwd: DESKTOP, stdio: "inherit" });

  // 4. Launch Electron
  console.log("[dev] Launching Electron...");
  electronProc = spawn("npx", ["electron", "."], {
    cwd: DESKTOP,
    stdio: "inherit",
    shell: true,
  });

  electronProc.on("exit", (code) => {
    console.log(`[dev] Electron exited (code ${code})`);
    cleanup();
  });
}

main().catch((err) => {
  console.error("[dev] Fatal:", err.message);
  cleanup();
});
