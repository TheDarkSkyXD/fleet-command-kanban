const fs = require('fs');
const path = require('path');

// afterPack hook for electron-builder
// Copies native modules from app.asar.unpacked to daemon/_modules
// These are rebuilt by electron-builder for Electron's Node.js ABI
exports.default = async function(context) {
  const { appOutDir, packager } = context;

  console.log('[afterPack] Starting native module copy...');

  // Determine paths based on platform
  let resourcesDir;
  if (packager.platform.name === 'mac') {
    resourcesDir = path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = path.join(appOutDir, 'resources');
  }

  const unpackedModules = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  // Note: _modules is used instead of node_modules to avoid electron-builder filtering
  const daemonModules = path.join(resourcesDir, 'daemon', '_modules');

  // Check if unpacked modules exist
  if (!fs.existsSync(unpackedModules)) {
    console.log('[afterPack] No unpacked node_modules found, skipping copy');
    return;
  }

  // Copy native modules (better-sqlite3, node-pty) from unpacked
  // These are rebuilt by electron-builder for Electron's ABI
  const nativeModules = ['better-sqlite3', 'node-pty'];
  for (const moduleName of nativeModules) {
    const srcPath = path.join(unpackedModules, moduleName);
    const destPath = path.join(daemonModules, moduleName);

    if (fs.existsSync(srcPath)) {
      console.log(`[afterPack] Copying ${moduleName} to daemon/_modules (overwriting pnpm version)`);
      // Remove existing (pnpm-installed) version
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true });
      }
      copyDirSync(srcPath, destPath);
    } else {
      console.log(`[afterPack] ${moduleName} not found in unpacked modules`);
    }
  }

  console.log('[afterPack] Native modules copied successfully');
};

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
