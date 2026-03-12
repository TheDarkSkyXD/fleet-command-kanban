const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Prepare daemon for packaging using pnpm deploy
// This creates a standalone daemon directory with all production dependencies

const desktopDir = path.join(__dirname, '..');
const workspaceRoot = path.join(desktopDir, '..', '..');
const daemonDir = path.join(desktopDir, '..', 'daemon');
const buildDir = path.join(desktopDir, 'build', 'daemon');

console.log('[prepare-daemon] Creating standalone daemon package...');

// Clean previous build
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true });
}

// pnpm deploy creates a standalone package with all dependencies
// Must be run from workspace root with --filter
// --prod excludes devDependencies
execSync(`pnpm --filter @fleet-command/daemon deploy --prod "${buildDir}"`, {
  cwd: workspaceRoot,
  stdio: 'inherit'
});

// Copy the bin directory (pnpm deploy doesn't always handle bin correctly)
const srcBin = path.join(daemonDir, 'bin');
const destBin = path.join(buildDir, 'bin');
if (!fs.existsSync(destBin)) {
  fs.mkdirSync(destBin, { recursive: true });
}
for (const file of fs.readdirSync(srcBin)) {
  if (!file.endsWith('.test.js')) {
    fs.copyFileSync(path.join(srcBin, file), path.join(destBin, file));
  }
}

// Copy system-agents if they exist (runtime loaded files)
const srcAgents = path.join(daemonDir, 'dist', 'system-agents');
const destAgents = path.join(buildDir, 'dist', 'system-agents');
if (fs.existsSync(srcAgents)) {
  copyDirSync(srcAgents, destAgents);
}

// Flatten node_modules by resolving symlinks
// pnpm creates symlinked node_modules which electron-builder can't copy
console.log('[prepare-daemon] Flattening node_modules (resolving symlinks)...');
const nodeModules = path.join(buildDir, 'node_modules');
flattenNodeModules(nodeModules);

// Remove unnecessary directories created by pnpm deploy
const unneededDirs = ['apps', 'src', 'tsconfig.json', 'tsconfig.tsbuildinfo'];
for (const name of unneededDirs) {
  const dirPath = path.join(buildDir, name);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

console.log('[prepare-daemon] Daemon package created at:', buildDir);

function flattenNodeModules(nodeModulesPath) {
  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(nodeModulesPath, entry.name);

    // Skip .pnpm and hidden files
    if (entry.name === '.pnpm' || entry.name === '.bin' || entry.name === '.modules.yaml') {
      continue;
    }

    // Handle scoped packages (@org/pkg)
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        const scopedPath = path.join(entryPath, scopedEntry.name);
        resolveSymlink(scopedPath);
      }
    } else if (entry.isSymbolicLink()) {
      resolveSymlink(entryPath);
    }
  }

  // Remove .pnpm directory (no longer needed after flattening)
  const pnpmDir = path.join(nodeModulesPath, '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    fs.rmSync(pnpmDir, { recursive: true });
  }

  // Remove .modules.yaml
  const modulesYaml = path.join(nodeModulesPath, '.modules.yaml');
  if (fs.existsSync(modulesYaml)) {
    fs.unlinkSync(modulesYaml);
  }

  // Rename node_modules to _modules to avoid electron-builder's special handling
  // It will be renamed back by the main.ts when running
  const renamedPath = path.join(path.dirname(nodeModulesPath), '_modules');
  fs.renameSync(nodeModulesPath, renamedPath);
  console.log('[prepare-daemon] Renamed node_modules to _modules to avoid electron-builder filtering');
}

function resolveSymlink(linkPath) {
  if (!fs.existsSync(linkPath)) return;

  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    // Get the real path (follows all symlinks)
    const realPath = fs.realpathSync(linkPath);
    // Remove the symlink
    fs.unlinkSync(linkPath);
    // Copy the actual content
    copyDirSync(realPath, linkPath);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Resolve symlinks when copying
    const realSrcPath = fs.realpathSync(srcPath);
    const realStat = fs.statSync(realSrcPath);

    if (realStat.isDirectory()) {
      copyDirSync(realSrcPath, destPath);
    } else {
      fs.copyFileSync(realSrcPath, destPath);
    }
  }
}
