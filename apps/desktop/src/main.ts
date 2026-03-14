import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import { DEFAULT_PORT, DEFAULT_VITE_PORT } from '@fleet-command/shared'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Set app name for dock/taskbar (must be before app is ready)
app.setName('Fleet Command Kanban')

// Handle GPU process crashes gracefully to prevent black screens
app.on('gpu-info-update', () => { /* keep app alive */ })
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU') {
    console.error('[electron] GPU process gone, reason:', details.reason)
  }
})

let daemonProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let weSpawnedDaemon = false
let isQuitting = false

// Ensure only one instance runs at a time
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Focus existing window when a second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Remove the application menu bar (File, Edit, View, etc.)
Menu.setApplicationMenu(null)

// Handle toggling dev tools from the renderer
ipcMain.handle('toggle-devtools', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.toggleDevTools()
  }
})

// Handle folder picker dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

// --- Auto Updater (electron-updater) ---

let updateCheckTimer: ReturnType<typeof setInterval> | null = null

function setupAutoUpdater() {
  // Don't auto-download; let the user click "Install"
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('update-available', {
      available: true,
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseName: info.releaseName || `v${info.version}`,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n: any) => n.note).join('\n')
          : '',
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('update-download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('update-error', err.message)
  })
}

function startUpdateChecker() {
  // Initial check after a short delay so the window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 10_000)

  // Periodic checks
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, UPDATE_CHECK_INTERVAL_MS)
}

// IPC: Get current app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// IPC: Manual check for update
ipcMain.handle('check-for-update', async () => {
  const result = await autoUpdater.checkForUpdates()
  if (!result) return { available: false, currentVersion: app.getVersion() }
  return {
    available: result.updateInfo.version !== app.getVersion(),
    currentVersion: app.getVersion(),
    latestVersion: result.updateInfo.version
  }
})

// IPC: Start downloading the update
ipcMain.handle('download-update', async () => {
  await autoUpdater.downloadUpdate()
})

// IPC: Install the downloaded update (quit and install)
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})

async function isDaemonRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${DEFAULT_PORT}/health`)
    return response.ok
  } catch {
    return false
  }
}

async function startDaemon(): Promise<void> {
  // Skip spawning daemon if one is already running (e.g., started by pnpm dev)
  if (await isDaemonRunning()) {
    console.log('[electron] Daemon already running, skipping spawn')
    return
  }

  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  // In dev: __dirname is apps/desktop/out/main/, go up 4 levels to repo root
  // In prod: daemon is bundled in resources
  const bundledDaemonDir = isDev
    ? path.join(__dirname, '..', '..', '..', '..', 'apps', 'daemon')
    : path.join(process.resourcesPath, 'daemon')

  // In production, _modules needs to be accessible as node_modules for ESM resolution.
  // On Linux (AppImage), the filesystem is read-only, so we create a temp directory
  // with symlinks. On Mac/Windows, we can symlink directly inside the bundle.
  let daemonDir: string
  if (!isDev && process.platform === 'linux') {
    const tempDaemonDir = path.join(app.getPath('temp'), 'fleet-command-daemon')
    if (fs.existsSync(tempDaemonDir)) {
      fs.rmSync(tempDaemonDir, { recursive: true })
    }
    fs.mkdirSync(tempDaemonDir, { recursive: true })

    for (const entry of fs.readdirSync(bundledDaemonDir)) {
      if (entry === '_modules') continue
      fs.symlinkSync(
        path.join(bundledDaemonDir, entry),
        path.join(tempDaemonDir, entry)
      )
    }

    fs.symlinkSync(
      path.join(bundledDaemonDir, '_modules'),
      path.join(tempDaemonDir, 'node_modules')
    )
    console.log('[electron] Created temp daemon directory with node_modules symlink')
    daemonDir = tempDaemonDir
  } else if (!isDev) {
    // Mac/Windows: bundle filesystem is writable, symlink directly
    const modulesPath = path.join(bundledDaemonDir, '_modules')
    const nodeModulesPath = path.join(bundledDaemonDir, 'node_modules')
    if (fs.existsSync(modulesPath) && !fs.existsSync(nodeModulesPath)) {
      try {
        fs.symlinkSync(modulesPath, nodeModulesPath, 'junction')
        console.log('[electron] Created node_modules symlink for ESM resolution')
      } catch (err) {
        console.error('[electron] Failed to create node_modules symlink:', err)
      }
    }
    daemonDir = bundledDaemonDir
  } else {
    daemonDir = bundledDaemonDir
  }

  const daemonPath = path.join(daemonDir, 'bin', 'fleet-command.js')
  const nodeEnv = isDev ? 'development' : 'production'

  // In dev: use system Node.js so native modules (better-sqlite3) match.
  // In production: use Electron's Node.js with ELECTRON_RUN_AS_NODE so
  // native modules rebuilt for Electron work correctly.
  const nodePath = isDev ? 'node' : process.execPath
  const env: Record<string, string | undefined> = isDev
    ? { ...process.env, NODE_ENV: nodeEnv }
    : { ...process.env, NODE_ENV: nodeEnv, ELECTRON_RUN_AS_NODE: '1' }

  // On Linux, pass the frontend path explicitly since the daemon runs from a
  // temp dir where relative paths back to the AppImage won't resolve.
  if (!isDev && process.platform === 'linux') {
    env.FLEET_FRONTEND_DIST = path.join(process.resourcesPath, 'frontend')
  }

  console.log(`[electron] Starting daemon: ${nodePath} ${daemonPath} start`)

  // On Linux, use --preserve-symlinks so Node.js resolves modules relative
  // to the symlink paths (temp dir with node_modules) rather than the real paths
  // (read-only AppImage where only _modules exists).
  const nodeArgs = (!isDev && process.platform === 'linux')
    ? ['--preserve-symlinks', '--preserve-symlinks-main', daemonPath, 'start']
    : [daemonPath, 'start']

  daemonProcess = spawn(nodePath, nodeArgs, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // detached: true gives the daemon its own process group.
    // - Unix: setsid() makes it a process group leader so we can kill the
    //   entire group (daemon + Claude PTY sessions + MCP proxies) with one signal.
    //   Also prevents EPIPE crashes when Electron exits and closes pipes.
    // - Windows: CREATE_NEW_PROCESS_GROUP so taskkill /T targets only daemon's tree.
    detached: true,
    windowsHide: true
  })

  daemonProcess.stdout?.on('data', (data) => {
    console.log(`[daemon] ${data}`)
  })

  daemonProcess.stderr?.on('data', (data) => {
    console.error(`[daemon] ${data}`)
  })

  // Prevent EPIPE from crashing Electron when daemon writes after we start quitting
  daemonProcess.stdout?.on('error', () => { /* ignore broken pipe */ })
  daemonProcess.stderr?.on('error', () => { /* ignore broken pipe */ })

  daemonProcess.on('error', (err) => {
    console.error(`[daemon] error:`, err)
  })

  daemonProcess.on('exit', (code, signal) => {
    console.log(`[daemon] exited with code=${code} signal=${signal}`)
    // If daemon exited quickly (e.g. "already running"), we didn't really spawn it
    if (code !== 0) {
      weSpawnedDaemon = false
    }
    daemonProcess = null
  })

  weSpawnedDaemon = true

  // Give daemon a moment to start
  await new Promise(r => setTimeout(r, 2000))

  // If daemon exited during the wait (e.g. lock conflict), clear the flag
  if (!daemonProcess) {
    weSpawnedDaemon = false
  }
}

async function waitForHealth(): Promise<boolean> {
  // In dev, the daemon may be compiling (tsc) before starting, so allow up to 60s
  const maxAttempts = 120
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${DEFAULT_PORT}/health`)
      if (response.ok) return true
    } catch {
      // Retry
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

function createWindow() {
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  // Icon path differs between dev and prod, and by platform
  // Windows needs .ico for proper Task Manager / taskbar icon display
  // Dev: __dirname is apps/desktop/out/main/, icon is in apps/desktop/build/
  // Prod: icon is bundled with the app
  const iconExt = process.platform === 'win32' ? 'ico' : 'png'
  const iconPath = isDev
    ? path.join(__dirname, '..', '..', 'build', `icon.${iconExt}`)
    : path.join(process.resourcesPath, `icon.${iconExt}`)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // hiddenInset is macOS-only; use default frame on other platforms
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    backgroundColor: '#0d1117',
    show: false // Prevent flash; show once content is ready
  })

  // Show window once content has painted to avoid white/black flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle renderer crashes gracefully instead of leaving a black/white screen
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] Renderer crashed:', details.reason)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy()
    }
    if (!isQuitting) {
      createWindow()
    }
  })

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[electron] Window unresponsive')
    const response = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['Wait', 'Reload', 'Close'],
      title: 'Fleet Command Kanban',
      message: 'The application is not responding.',
      defaultId: 1
    })
    if (response === 1 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    } else if (response === 2) {
      app.quit()
    }
  })

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  // In dev: clear cache to avoid stale HMR modules
  if (isDev) {
    mainWindow.webContents.session.clearCache()
  }

  // In dev: load from Vite dev server (which proxies API to daemon)
  // In prod: load from daemon (which serves static files)
  const url = isDev
    ? `http://localhost:${DEFAULT_VITE_PORT}`
    : `http://localhost:${DEFAULT_PORT}`

  mainWindow.loadURL(url)
}

app.whenReady().then(async () => {
  // Refresh Windows icon cache on launch so Task Manager shows the correct icon
  if (process.platform === 'win32') {
    try {
      spawn('ie4uinit.exe', ['-show'], { detached: true, stdio: 'ignore' }).unref()
    } catch {
      // Non-critical, ignore
    }
  }

  try {
    await startDaemon()
    const healthy = await waitForHealth()
    if (!healthy) {
      dialog.showErrorBox('Startup Error', 'Could not start daemon')
      app.quit()
      return
    }
    createWindow()
    setupAutoUpdater()
    startUpdateChecker()
  } catch (err) {
    dialog.showErrorBox('Startup Error', String(err))
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer)
    updateCheckTimer = null
  }
})

app.on('will-quit', (event) => {
  // Only clean up daemon processes that we spawned ourselves.
  // NEVER kill parent process trees — on Windows this can kill explorer.exe
  // and cause a system-wide black screen requiring a restart.
  if (!weSpawnedDaemon) return

  const pid = daemonProcess?.pid ?? getDaemonPidFromFile()
  if (!pid || pid <= 1) return

  // Graceful shutdown: send SIGTERM so the daemon can clean up its children
  // (Claude PTY sessions, MCP proxies, system agents), close DB, remove PID file.
  // The daemon has a 10-second internal shutdown timeout.
  gracefulShutdownDaemon(pid)
})

/**
 * Read daemon PID from its PID file as a fallback (e.g., if daemonProcess ref was lost).
 */
function getDaemonPidFromFile(): number | null {
  try {
    const homeDir = process.env.USERPROFILE || process.env.HOME || ''
    const pidFile = path.join(homeDir, '.fleet-command', 'daemon.pid')
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
      if (pid && pid !== process.pid && pid !== process.ppid) return pid
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Graceful daemon shutdown sequence:
 * 1. Send SIGTERM to the daemon's process group (daemon + all its children)
 * 2. Wait briefly for graceful exit (daemon sends SIGTERM to Claude sessions internally)
 * 3. Force kill anything still alive
 *
 * Because the daemon is spawned with detached:true, it has its own process group,
 * so -pid targets exactly: daemon + Claude PTY sessions + MCP proxies.
 */
function gracefulShutdownDaemon(pid: number): void {
  // Step 1: Graceful SIGTERM
  if (process.platform === 'win32') {
    // On Windows, taskkill without /F sends WM_CLOSE to GUI apps and
    // CTRL_BREAK_EVENT to console apps, allowing graceful shutdown.
    spawnSync('taskkill', ['/T', '/PID', String(pid)], {
      stdio: 'ignore',
      timeout: 3000
    })
  } else {
    // On Unix, send SIGTERM to the entire process group (daemon is group leader
    // because we spawned with detached:true which calls setsid).
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
    }
  }

  // Step 2: Wait up to 5 seconds for daemon to finish its graceful shutdown.
  // The daemon internally waits up to 8s for Claude sessions to exit, but we
  // give it 5s here — if it's still alive, we force kill.
  if (isProcessAlive(pid)) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && isProcessAlive(pid)) {
      // Synchronous sleep: ping on Windows (timeout cmd needs a console),
      // sleep on Unix. Window is already closed so blocking is fine.
      if (process.platform === 'win32') {
        spawnSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore', timeout: 2000 })
      } else {
        spawnSync('sleep', ['0.5'], { stdio: 'ignore', timeout: 2000 })
      }
    }
  }

  // Step 3: Force kill any survivors
  if (isProcessAlive(pid)) {
    console.warn('[electron] Daemon still alive after graceful shutdown, force killing')
    forceKillProcessTree(pid)
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 doesn't kill — just checks if process exists
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function forceKillProcessTree(pid: number): void {
  if (!pid || pid <= 1) return
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        stdio: 'ignore',
        timeout: 5000
      })
    } else {
      // SIGKILL the entire process group
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
      }
    }
  } catch { /* already dead */ }
}
