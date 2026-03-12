import { Express } from "express";
import fs from "fs/promises";
import { accessSync } from "fs";
import path from "path";
import os from "os";

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function registerFilesystemRoutes(app: Express): void {
  /**
   * GET /api/filesystem/browse?path=...
   * Lists directories at the given path. If no path provided, returns home directory roots.
   */
  app.get("/api/filesystem/browse", async (req, res) => {
    try {
      const requestedPath = (req.query.path as string) || "";

      // If no path, return system roots / home
      if (!requestedPath) {
        const roots = getSystemRoots();
        res.json({
          path: "",
          parent: null,
          entries: roots,
        });
        return;
      }

      const resolved = path.resolve(requestedPath);

      // Check directory exists and is accessible
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          res.status(400).json({ error: "Path is not a directory" });
          return;
        }
      } catch {
        res.status(404).json({ error: "Directory not found" });
        return;
      }

      const dirents = await fs.readdir(resolved, { withFileTypes: true });
      const entries: DirEntry[] = [];

      for (const dirent of dirents) {
        // Skip hidden files/folders (starting with .)
        if (dirent.name.startsWith(".")) continue;
        // Skip node_modules and other common non-project dirs
        if (dirent.name === "node_modules" || dirent.name === "__pycache__") continue;

        if (dirent.isDirectory()) {
          entries.push({
            name: dirent.name,
            path: path.join(resolved, dirent.name),
            isDirectory: true,
          });
        }
      }

      // Sort alphabetically, case-insensitive
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

      const parent = path.dirname(resolved);
      res.json({
        path: resolved,
        parent: parent !== resolved ? parent : null,
        entries,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}

function getSystemRoots(): DirEntry[] {
  const homeDir = os.homedir();
  const entries: DirEntry[] = [
    { name: "Home", path: homeDir, isDirectory: true },
  ];

  if (process.platform === "win32") {
    // Add common drive letters on Windows
    for (const letter of ["C", "D", "E", "F"]) {
      const drive = `${letter}:\\`;
      try {
        accessSync(drive);
        entries.push({ name: `${letter}:`, path: drive, isDirectory: true });
      } catch {
        // Drive doesn't exist, skip
      }
    }
  } else {
    // Unix-like: add root
    entries.push({ name: "/", path: "/", isDirectory: true });
  }

  return entries;
}
