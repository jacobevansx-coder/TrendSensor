import { summarizeMonitorChanges } from "./diff.js";
import { acquireLock, listMonitors, listScans, saveMonitor, updateMonitor } from "./storage.js";
import { parseScanRequest, runScan } from "./scan-service.js";

const MIN_REFRESH_MINUTES = 5;
const MAX_REFRESH_MINUTES = 720;

function computeNextRunAt(refreshMinutes, from = new Date()) {
  return new Date(from.getTime() + refreshMinutes * 60_000).toISOString();
}

function normalizeRefreshMinutes(value) {
  const number = Number(value ?? 15);
  if (!Number.isFinite(number)) {
    throw new Error("Refresh cadence must be a number of minutes.");
  }

  const rounded = Math.round(number);
  if (rounded < MIN_REFRESH_MINUTES || rounded > MAX_REFRESH_MINUTES) {
    throw new Error(`Refresh cadence must stay between ${MIN_REFRESH_MINUTES} and ${MAX_REFRESH_MINUTES} minutes.`);
  }

  return rounded;
}

export function parseMonitorRequest(body) {
  const scan = parseScanRequest(body);

  return {
    ...scan,
    refreshMinutes: normalizeRefreshMinutes(body?.refreshMinutes ?? 15)
  };
}

export async function createMonitor(input) {
  const now = new Date();
  const monitor = {
    id: crypto.randomUUID(),
    label: input.label?.trim() || "Untitled Monitor",
    urls: input.urls,
    marketFocus: input.marketFocus?.trim() || "",
    refreshMinutes: input.refreshMinutes,
    status: "active",
    createdAt: now.toISOString(),
    lastRunAt: null,
    nextRunAt: now.toISOString(),
    latestScanId: null,
    latestScore: null,
    latestMarkets: [],
    latestFreshness: 0,
    lastDiff: null
  };

  await saveMonitor(monitor);
  return refreshMonitorById(monitor.id, { reason: "initial" });
}

const refreshLocks = new Map();
const pendingReasons = new Map();
const REASON_PRIORITY = { manual: 3, initial: 2, scheduled: 1 };

export function highestPriorityReason(reasons) {
  let best = null;
  let bestRank = -Infinity;

  for (const reason of reasons) {
    const rank = REASON_PRIORITY[reason] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = reason;
    }
  }

  return best ?? "manual";
}

export function singleFlight(locks, key, task) {
  const existing = locks.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve().then(task).finally(() => locks.delete(key));
  locks.set(key, promise);
  return promise;
}

export function refreshMonitorById(monitorId, options = {}) {
  // Two layers: an in-process single-flight coalesces concurrent calls for the same monitor, and a
  // durable per-monitor file lock (acquireLock) serialises across processes sharing the data dir.
  // Late-joining callers add their reason to the shared set so a manual click that lands during an
  // in-flight scheduled refresh still wins (manual > initial > scheduled) instead of recording "scheduled".
  const reasons = pendingReasons.get(monitorId) ?? new Set();
  reasons.add(options.reason ?? "manual");
  pendingReasons.set(monitorId, reasons);

  return singleFlight(refreshLocks, monitorId, async () => {
    try {
      return await runMonitorRefresh(monitorId, () => highestPriorityReason(reasons));
    } finally {
      pendingReasons.delete(monitorId);
    }
  });
}

async function runMonitorRefresh(monitorId, resolveReason) {
  const lock = await acquireLock(`monitor-${monitorId}`);
  if (!lock) {
    // Another process is already refreshing this monitor. Don't duplicate the fetch/diff; return the
    // most recently persisted snapshot with skipped:true. Product behaviour: in a single-process
    // deployment this path never runs (the in-process single-flight returns the winner's real result);
    // only when two processes share the data dir does the loser return slightly-stale state, and the
    // client's next /api/state poll surfaces the winner's fresh scan. We deliberately don't block the
    // request polling for the winner — that could hold an HTTP response for the full ~48s scan budget.
    const [monitors, scans] = await Promise.all([listMonitors(), listScans()]);
    const monitor = monitors.find((item) => item.id === monitorId);
    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const scan = scans.find((item) => item.id === monitor.latestScanId) ?? null;
    return { monitor, scan, skipped: true };
  }

  try {
    const [monitors, scans] = await Promise.all([listMonitors(), listScans()]);
    const monitor = monitors.find((item) => item.id === monitorId);

    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const previousScan = scans.find((scan) => scan.id === monitor.latestScanId) ?? null;
    const scan = await runScan(
      {
        label: monitor.label,
        urls: monitor.urls,
        marketFocus: monitor.marketFocus
      },
      {
        monitorId: monitor.id,
        monitorLabel: monitor.label,
        marketFocus: monitor.marketFocus,
        refreshReason: resolveReason
      }
    );

    const now = new Date();
    const diff = summarizeMonitorChanges(previousScan, scan);
    const updatedMonitor = await updateMonitor(monitor.id, (currentMonitor) => ({
      ...currentMonitor,
      lastRunAt: now.toISOString(),
      nextRunAt: currentMonitor.status === "active" ? computeNextRunAt(currentMonitor.refreshMinutes, now) : null,
      latestScanId: scan.id,
      latestScore: scan.overallScore,
      latestMarkets: scan.markets ?? [],
      latestFreshness: scan.overallFreshness ?? 0,
      lastDiff: diff
    }));

    return { monitor: updatedMonitor, scan };
  } finally {
    await lock.release();
  }
}

export async function setMonitorStatus(monitorId, status) {
  if (!["active", "paused"].includes(status)) {
    throw new Error("Monitor status must be active or paused.");
  }

  return updateMonitor(monitorId, (monitor) => ({
    ...monitor,
    status,
    nextRunAt: status === "active" ? new Date().toISOString() : null
  }));
}

export function shouldRefreshMonitor(monitor, now = Date.now()) {
  if (monitor.status !== "active") {
    return false;
  }

  return !monitor.nextRunAt || Date.parse(monitor.nextRunAt) <= now;
}
