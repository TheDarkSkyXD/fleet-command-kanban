import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { DEFAULT_PORT, DEFAULT_VITE_PORT } from '@potato-cannon/shared'

// Set app name for dock/taskbar (must be before app is ready)
app.setName('Potato Cannon')

let daemonProcess: ChildProcess | null = null

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

async function startDaemon(): Promise<void> {
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  // In dev: __dirname is apps/desktop/out/main/, go up 4 levels to repo root
  // In prod: daemon is bundled in resources
  const daemonDir = isDev
    ? path.join(__dirname, '..', '..', '..', '..', 'apps', 'daemon')
    : path.join(process.resourcesPath, 'daemon')
  const daemonPath = path.join(daemonDir, 'bin', 'potato-cannon.js')

  const nodeEnv = isDev ? 'development' : 'production'

  // In production, _modules needs to be symlinked to node_modules for ESM resolution
  // (electron-builder filters out node_modules from extraResources, so we rename it during build)
  if (!isDev) {
    const modulesPath = path.join(daemonDir, '_modules')
    const nodeModulesPath = path.join(daemonDir, 'node_modules')
    if (fs.existsSync(modulesPath) && !fs.existsSync(nodeModulesPath)) {
      try {
        fs.symlinkSync(modulesPath, nodeModulesPath, 'junction')
        console.log('[electron] Created node_modules symlink for ESM resolution')
      } catch (err) {
        console.error('[electron] Failed to create node_modules symlink:', err)
      }
    }
  }

  // In production, use Electron's Node.js to ensure native module compatibility
  // ELECTRON_RUN_AS_NODE makes Electron act as a regular Node.js process
  const nodePath = isDev ? process.execPath : process.execPath
  const env = isDev
    ? { ...process.env, NODE_ENV: nodeEnv }
    : { ...process.env, NODE_ENV: nodeEnv, ELECTRON_RUN_AS_NODE: '1' }

  console.log(`[electron] Starting daemon: ${nodePath} ${daemonPath} start`)

  daemonProcess = spawn(nodePath, [daemonPath, 'start'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  daemonProcess.stdout?.on('data', (data) => {
    console.log(`[daemon] ${data}`)
  })

  daemonProcess.stderr?.on('data', (data) => {
    console.error(`[daemon] ${data}`)
  })

  daemonProcess.on('error', (err) => {
    console.error(`[daemon] error:`, err)
  })

  // Give daemon a moment to start
  await new Promise(r => setTimeout(r, 2000))
}

async function waitForHealth(): Promise<boolean> {
  const maxAttempts = 30
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

  // Icon path differs between dev and prod
  // Dev: __dirname is apps/desktop/out/main/, icon is in apps/desktop/build/
  // Prod: icon is bundled with the app
  const iconPath = isDev
    ? path.join(__dirname, '..', '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png')

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117'
  })

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  // In dev: load from Vite dev server (which proxies API to daemon)
  // In prod: load from daemon (which serves static files)
  const url = isDev
    ? `http://localhost:${DEFAULT_VITE_PORT}`
    : `http://localhost:${DEFAULT_PORT}`

  win.loadURL(url)
}

app.whenReady().then(async () => {
  try {
    await startDaemon()
    const healthy = await waitForHealth()
    if (!healthy) {
      dialog.showErrorBox('Startup Error', 'Could not start daemon')
      app.quit()
      return
    }
    createWindow()
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

app.on('will-quit', () => {
  if (daemonProcess) {
    daemonProcess.kill()
  }
})
