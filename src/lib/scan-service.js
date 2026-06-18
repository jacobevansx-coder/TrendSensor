import { analyzeHtml, summarizeScan } from "./analyzer.js";
import { fetchPage } from "./fetcher.js";
import { saveScan } from "./storage.js";
import { ALLOW_PRIVATE_TARGETS_FLAG, allowPrivateTargets, isBlockedHostname } from "./host-policy.js";

function normalizeUrl(input) {
  const value = String(input ?? "").trim();
  if (!value) {
    return null;
  }

  let url;
  try {
    if (/^[a-z]+:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
      throw new Error("scheme");
    }

    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    url = new URL(withScheme);
    if (!/^https?:$/i.test(url.protocol)) {
      throw new Error("scheme");
    }

    url.hash = "";
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (!allowPrivateTargets() && isBlockedHostname(url.hostname)) {
    throw new Error(
      `Blocked private or loopback host: ${url.hostname}. Set ${ALLOW_PRIVATE_TARGETS_FLAG}=1 to allow local scans.`
    );
  }

  return url.toString();
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

function parseUrls(rawUrls) {
  const normalized = (Array.isArray(rawUrls) ? rawUrls : []).map(normalizeUrl).filter(Boolean);
  const uniqueUrls = [...new Set(normalized)];

  if (uniqueUrls.length === 0) {
    throw new Error("Provide at least one valid URL.");
  }
  if (uniqueUrls.length > 8) {
    throw new Error("Limit each scan to 8 URLs so the audit stays fast and reviewable.");
  }

  return uniqueUrls;
}

export function parseScanRequest(body) {
  return {
    label: String(body?.label ?? "").trim(),
    urls: parseUrls(body?.urls),
    marketFocus: String(body?.marketFocus ?? "").trim()
  };
}

export function buildScanLabel(input, context = {}) {
  const baseLabel = input.label?.trim() || context.defaultLabel || "Untitled Audit";

  if (!context.monitorLabel) {
    return baseLabel;
  }

  return `${context.monitorLabel} Snapshot`;
}

export async function runScan(input, context = {}) {
  const marketFocus = input.marketFocus?.trim() || context.marketFocus || "";
  const pageResults = await mapWithConcurrency(input.urls, 2, async (url) => {
    try {
      const fetchedAt = new Date().toISOString();
      const page = await fetchPage(url);
      const analysis = analyzeHtml(url, page.html, {
        finalUrl: page.finalUrl,
        fetchedAt,
        marketFocus
      });

      return {
        ok: true,
        ...analysis
      };
    } catch (error) {
      return {
        ok: false,
        url,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  const scan = {
    ...summarizeScan(buildScanLabel(input, context), pageResults),
    marketFocus,
    monitorId: context.monitorId ?? null,
    refreshReason: resolveRefreshReason(context.refreshReason)
  };

  await saveScan(scan);
  return scan;
}

// refreshReason may be a string or a thunk. A thunk is resolved here — after fetches complete — so a
// higher-priority reason that arrives while the scan is in flight (e.g. a manual click joining an
// in-flight scheduled refresh) is reflected in the saved scan.
export function resolveRefreshReason(reason) {
  const value = typeof reason === "function" ? reason() : reason;
  return value || "manual";
}

export { normalizeUrl, parseUrls };
export { isBlockedHostname as isPrivateHost } from "./host-policy.js";
