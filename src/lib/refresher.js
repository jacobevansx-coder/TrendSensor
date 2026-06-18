import { listMonitors } from "./storage.js";
import { refreshMonitorById, shouldRefreshMonitor } from "./monitor-service.js";

export function createMonitorRefresher(options = {}) {
  const intervalMs = options.intervalMs ?? 30_000;
  let timer = null;
  let running = false;
  let lastTickAt = null;
  let lastError = null;

  async function tick() {
    if (running) {
      return;
    }

    running = true;
    lastTickAt = new Date().toISOString();

    try {
      const dueMonitor = (await listMonitors())
        .filter((monitor) => shouldRefreshMonitor(monitor))
        .sort((left, right) => Date.parse(left.nextRunAt ?? 0) - Date.parse(right.nextRunAt ?? 0))[0];

      if (dueMonitor) {
        await refreshMonitorById(dueMonitor.id, { reason: "scheduled" });
      }

      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void tick();
      }, intervalMs);
      if (timer.unref) {
        timer.unref();
      }
      void tick();
    },
    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = null;
    },
    tick,
    getStatus() {
      return {
        running,
        intervalMs,
        lastTickAt,
        lastError
      };
    }
  };
}
