import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listMonitors, listScans, listSources } from "./lib/storage.js";
import { parseScanRequest, runScan } from "./lib/scan-service.js";
import { createMonitorRefresher } from "./lib/refresher.js";
import { createMonitor, parseMonitorRequest, refreshMonitorById, setMonitorStatus } from "./lib/monitor-service.js";
import { refreshSources, saveSourcesFromRequest } from "./lib/source-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIRECTORY = path.resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) {
      throw new Error("Request body exceeded 100KB.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON in request body.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": MIME_TYPES[".json"],
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.resolve(PUBLIC_DIRECTORY, `.${safePath}`);

  if (!resolvedPath.startsWith(PUBLIC_DIRECTORY)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(resolvedPath);
  const type = MIME_TYPES[extension] ?? "application/octet-stream";
  let file;

  try {
    file = await readFile(resolvedPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    throw error;
  }

  response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  response.end(file);
}

async function fetchState(refresher) {
  const [scans, monitors, sources] = await Promise.all([listScans(), listMonitors(), listSources()]);
  return {
    scans,
    monitors,
    sources,
    refresher: refresher?.getStatus?.() ?? null
  };
}

function buildStatusCode(message) {
  return message.includes("Invalid URL") ||
    message.includes("Only http and https") ||
    message.includes("Blocked private or loopback host") ||
    message.includes("Invalid JSON") ||
    message.includes("source feed") ||
    message.includes("source feeds") ||
    message.includes("Unsupported source") ||
    message.includes("No feed items") ||
    message.includes("Unexpected content type") ||
    message.includes("Limit each scan") ||
    message.includes("Provide at least one") ||
    message.includes("Request body exceeded") ||
    message.includes("Refresh cadence") ||
    message.includes("Monitor status")
    ? 400
    : message.includes("Monitor not found")
      ? 404
      : 500;
}

export function createAppServer(options = {}) {
  const refresher = options.refresher ?? createMonitorRefresher();

  return http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        sendJson(response, 400, { error: "Missing request URL." });
        return;
      }

      const url = new URL(request.url, "http://localhost");
      const monitorActionMatch = /^\/api\/monitors\/([^/]+)\/(refresh|status)$/.exec(url.pathname);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && (url.pathname === "/api/state" || url.pathname === "/api/scans")) {
        sendJson(response, 200, await fetchState(refresher));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/scan") {
        const body = await readJsonBody(request);
        const parsed = parseScanRequest(body);
        const scan = await runScan(parsed);
        sendJson(response, 201, { scan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/monitors") {
        const body = await readJsonBody(request);
        const parsed = parseMonitorRequest(body);
        const result = await createMonitor(parsed);
        sendJson(response, 201, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sources") {
        const body = await readJsonBody(request);
        const sources = await saveSourcesFromRequest(body);
        sendJson(response, 200, { sources });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sources/refresh") {
        const body = await readJsonBody(request);
        const result = await refreshSources(body);
        sendJson(response, 201, result);
        return;
      }

      if (request.method === "POST" && monitorActionMatch) {
        const [, monitorId, action] = monitorActionMatch;

        if (action === "refresh") {
          const result = await refreshMonitorById(monitorId, { reason: "manual" });
          sendJson(response, 200, result);
          return;
        }

        if (action === "status") {
          const body = await readJsonBody(request);
          const monitor = await setMonitorStatus(monitorId, String(body?.status ?? ""));
          sendJson(response, 200, { monitor });
          return;
        }
      }

      if (request.method === "GET") {
        await serveStatic(response, url.pathname);
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      sendJson(response, buildStatusCode(message), { error: message });
    }
  });
}

// Only auto-start when run directly (node src/server.js), not when imported by tests.
const isMainModule = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);
  const refresher = createMonitorRefresher();
  refresher.start();

  const server = createAppServer({ refresher });
  server.listen(port, () => {
    console.log(`TrendSensor listening on http://localhost:${port}`);
  });
}
