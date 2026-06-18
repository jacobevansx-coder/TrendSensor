import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// src/lib/storage.js -> repo root is two levels up. Anchor data here, not on caller cwd.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveDataDir(env = process.env) {
  return env.TREND_SENSOR_DATA_DIR ? path.resolve(env.TREND_SENSOR_DATA_DIR) : path.join(APP_ROOT, "data");
}

const DATA_DIRECTORY = resolveDataDir();
const SCANS_FILE = path.join(DATA_DIRECTORY, "scans.json");
const MONITORS_FILE = path.join(DATA_DIRECTORY, "monitors.json");
const SOURCES_FILE = path.join(DATA_DIRECTORY, "sources.json");
const LOCK_DIRECTORY = path.join(DATA_DIRECTORY, "locks");
const MAX_SCANS = 40;

let writeQueue = Promise.resolve();

async function ensureStorage() {
  await mkdir(DATA_DIRECTORY, { recursive: true });
}

async function readJsonArray(filePath) {
  await ensureStorage();

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeJsonArray(filePath, payload) {
  await ensureStorage();
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, filePath);
}

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

export function listScans() {
  return readJsonArray(SCANS_FILE);
}

export function listMonitors() {
  return readJsonArray(MONITORS_FILE);
}

export function listSources() {
  return readJsonArray(SOURCES_FILE);
}

export function saveScan(scan) {
  return enqueueWrite(async () => {
    const current = await readJsonArray(SCANS_FILE);
    const next = [scan, ...current].slice(0, MAX_SCANS);
    await writeJsonArray(SCANS_FILE, next);
    return scan;
  });
}

export function saveMonitor(monitor) {
  return enqueueWrite(async () => {
    const current = await readJsonArray(MONITORS_FILE);
    const next = [monitor, ...current.filter((item) => item.id !== monitor.id)];
    await writeJsonArray(MONITORS_FILE, next);
    return monitor;
  });
}

export function saveSources(sources) {
  return enqueueWrite(async () => {
    await writeJsonArray(SOURCES_FILE, sources);
    return sources;
  });
}

export function updateMonitor(monitorId, updater) {
  return enqueueWrite(async () => {
    const current = await readJsonArray(MONITORS_FILE);
    const index = current.findIndex((monitor) => monitor.id === monitorId);

    if (index === -1) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const updated = await updater(current[index]);
    current[index] = updated;
    await writeJsonArray(MONITORS_FILE, current);
    return updated;
  });
}

async function isLockStale(lockPath, staleMs) {
  try {
    const stats = await stat(lockPath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch (error) {
    if (error.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

// Advisory cross-process lock via atomic O_EXCL create (`wx`). Returns a handle with release(), or null
// if another live holder keeps it for the whole wait window. A lock whose file is older than staleMs is
// reclaimed, so a process that dies mid-refresh can never permanently brick a monitor.
// ponytail: time-based staleness, no fencing token. Ceiling — if a real operation runs longer than
// staleMs a peer could steal the lock and both run. The default 120s sits comfortably above the
// worst-case monitor scan (~48s: up to 8 URLs at concurrency 2, each capped at a 12s timeout), so a
// false steal is practically unreachable. A fencing token / DB row lock is the upgrade path if scans
// ever grow unbounded.
export async function acquireLock(name, options = {}) {
  const staleMs = options.staleMs ?? 120_000;
  const waitMs = options.waitMs ?? 8_000;
  const pollMs = options.pollMs ?? 100;

  await mkdir(LOCK_DIRECTORY, { recursive: true });
  const lockPath = path.join(LOCK_DIRECTORY, `${encodeURIComponent(name)}.lock`);
  const deadline = Date.now() + waitMs;

  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      } finally {
        await handle.close();
      }

      let released = false;
      return {
        path: lockPath,
        async release() {
          if (released) {
            return;
          }
          released = true;
          await rm(lockPath, { force: true });
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      if (await isLockStale(lockPath, staleMs)) {
        await rm(lockPath, { force: true });
        continue;
      }

      if (Date.now() >= deadline) {
        return null;
      }

      await delay(pollMs);
    }
  }
}
