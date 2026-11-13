/**
 * Copy frontend/build → backend/public for native Render (Root Directory = backend).
 * Usage (from backend/): npm run sync:frontend
 * Or from repo root after CRA build:
 *   node backend/scripts/syncFrontendBuild.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const source = path.resolve(backendRoot, "..", "frontend", "build");
const dest = path.join(backendRoot, "public");

function copyRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  }
}

if (!fs.existsSync(path.join(source, "index.html"))) {
  console.error(`Missing CRA build at ${source}. Run: cd frontend && npm run build`);
  process.exit(1);
}

emptyDir(dest);
copyRecursive(source, dest);
console.log(`Synced frontend build → ${dest}`);
