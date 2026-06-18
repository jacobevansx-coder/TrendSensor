const POLL_INTERVAL_MS = 30_000;

const state = {
  scans: [],
  monitors: [],
  sources: [],
  activeScanId: null,
  activeMonitorId: null,
  loading: false,
  sourcesDirty: false
};

const monitorList = document.querySelector("#monitor-list");
const historyList = document.querySelector("#history-list");
const sourceList = document.querySelector("#source-list");
const results = document.querySelector("#results");
const statusCard = document.querySelector("#status-card");
const statusMeta = document.querySelector("#status-meta");
const monitorCount = document.querySelector("#monitor-count");
const snapshotCount = document.querySelector("#snapshot-count");
const sourceCount = document.querySelector("#source-count");
const scanForm = document.querySelector("#scan-form");
const scanButton = document.querySelector("#scan-button");
const monitorButton = document.querySelector("#monitor-button");
const sourcesTextarea = document.querySelector("#sources-json");
const saveSourcesButton = document.querySelector("#save-sources-button");
const refreshSourcesButton = document.querySelector("#refresh-sources-button");
const summaryTemplate = document.querySelector("#summary-template");
const pageTemplate = document.querySelector("#page-template");

function setStatus(message, tone = "idle", meta = []) {
  statusCard.querySelector(".status-message").textContent = message;
  statusCard.dataset.tone = tone;
  statusMeta.innerHTML = "";

  for (const line of meta) {
    const item = document.createElement("span");
    item.className = "status-pill";
    item.textContent = line;
    statusMeta.append(item);
  }
}

function formatDate(value) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMinutes(value) {
  if (!value) {
    return "n/a";
  }
  if (value < 60) {
    return `${value} min`;
  }
  if (value % 60 === 0) {
    return `${value / 60} hr`;
  }
  return `${value} min`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createStackItem(title, copy) {
  const item = document.createElement("div");
  item.className = "stack-item";
  item.innerHTML = `<span class="stack-title">${escapeHtml(title)}</span><span>${escapeHtml(copy)}</span>`;
  return item;
}

function parseForm() {
  const formData = new FormData(scanForm);
  const label = String(formData.get("label") ?? "").trim();
  const marketFocus = String(formData.get("marketFocus") ?? "").trim();
  const refreshMinutes = Number(formData.get("refreshMinutes") ?? 15);
  const urls = String(formData.get("urls") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    label,
    marketFocus,
    refreshMinutes,
    urls
  };
}

function parseSourcesForm() {
  const raw = sourcesTextarea.value.trim();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.sources;
}

function getActiveMonitor() {
  return state.monitors.find((monitor) => monitor.id === state.activeMonitorId) ?? null;
}

function getActiveScan() {
  const monitor = getActiveMonitor();
  if (monitor?.latestScanId) {
    return state.scans.find((scan) => scan.id === monitor.latestScanId) ?? null;
  }

  return state.scans.find((scan) => scan.id === state.activeScanId) ?? null;
}

function normalizeDisplayName(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function renderMonitorList() {
  monitorList.innerHTML = "";
  monitorCount.textContent = `${state.monitors.length}`;

  if (state.monitors.length === 0) {
    monitorList.innerHTML = `<p class="history-empty">No live monitors yet.</p>`;
    return;
  }

  for (const monitor of state.monitors) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `history-item${monitor.id === state.activeMonitorId ? " active" : ""}`;
    item.innerHTML = `
      <div class="history-meta">
        <strong>${escapeHtml(monitor.label)}</strong>
        <span>${monitor.latestScore ?? "--"}/100</span>
      </div>
      <div class="history-meta">
        <span>${escapeHtml(normalizeDisplayName(monitor.marketFocus || monitor.latestMarkets?.[0]?.name || "auto"))}</span>
        <span>${escapeHtml(monitor.status)}</span>
      </div>
      <div class="history-meta history-copy">
        <span>${monitor.lastDiff?.summary?.[0] ? escapeHtml(monitor.lastDiff.summary[0]) : "Waiting for first refresh."}</span>
      </div>
      <div class="history-meta">
        <span>Next ${formatDate(monitor.nextRunAt)}</span>
        <span>${formatMinutes(monitor.refreshMinutes)}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      state.activeMonitorId = monitor.id;
      state.activeScanId = monitor.latestScanId ?? state.activeScanId;
      renderAll();
    });
    monitorList.append(item);
  }
}

function renderHistory() {
  historyList.innerHTML = "";
  snapshotCount.textContent = `${state.scans.length}`;

  if (state.scans.length === 0) {
    historyList.innerHTML = `<p class="history-empty">No scans yet.</p>`;
    return;
  }

  for (const scan of state.scans) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `history-item${scan.id === state.activeScanId && !state.activeMonitorId ? " active" : ""}`;
    item.innerHTML = `
      <div class="history-meta">
        <strong>${escapeHtml(scan.label)}</strong>
        <span>${scan.overallScore}/100</span>
      </div>
      <div class="history-meta">
        <span>${escapeHtml(normalizeDisplayName(scan.overallSiteType))}</span>
        <span>${formatDate(scan.createdAt)}</span>
      </div>
      <div class="history-meta history-copy">
        <span>${escapeHtml(scan.monitorId ? "Live monitor snapshot" : "Manual snapshot")}</span>
        <span>${formatMinutes(scan.recommendedRefreshMinutes)}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      state.activeMonitorId = null;
      state.activeScanId = scan.id;
      renderAll();
    });
    historyList.append(item);
  }
}

function renderSourceList() {
  sourceList.innerHTML = "";
  sourceCount.textContent = `${state.sources.length}`;

  if (state.sources.length === 0) {
    sourceList.innerHTML = `<p class="history-empty">No feed sources saved.</p>`;
    return;
  }

  for (const source of state.sources) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-meta">
        <strong>${escapeHtml(source.label)}</strong>
        <span>${escapeHtml(normalizeDisplayName(source.type))}</span>
      </div>
      <div class="history-meta history-copy">
        <span>${escapeHtml(source.url)}</span>
      </div>
      <div class="history-meta">
        <span>${escapeHtml(normalizeDisplayName(source.marketFocus || "auto"))}</span>
        <span>${escapeHtml(source.limit ?? 5)} items</span>
      </div>
    `;
    sourceList.append(item);
  }
}

function renderMonitorBanner(fragment, monitor, scan) {
  const banner = fragment.querySelector('[data-slot="monitor-banner"]');

  if (!monitor) {
    banner.remove();
    return;
  }

  const summary = monitor.lastDiff?.summary?.length ? monitor.lastDiff.summary : ["No change summary yet."];
  banner.innerHTML = `
    <div class="monitor-copy">
      <p class="eyebrow">Live Monitor</p>
      <h3>${escapeHtml(monitor.label)}</h3>
      <p>${escapeHtml(summary[0])}</p>
    </div>
    <div class="monitor-actions">
      <div class="monitor-meta">
        <span>Last ${formatDate(monitor.lastRunAt)}</span>
        <span>Next ${formatDate(monitor.nextRunAt)}</span>
        <span>${formatMinutes(monitor.refreshMinutes)}</span>
      </div>
      <div class="button-row">
        <button type="button" class="button-secondary" data-action="refresh-monitor" data-monitor-id="${monitor.id}">
          Refresh Now
        </button>
        <button type="button" class="button-secondary" data-action="toggle-monitor" data-monitor-id="${monitor.id}" data-status="${monitor.status === "active" ? "paused" : "active"}">
          ${monitor.status === "active" ? "Pause" : "Resume"}
        </button>
      </div>
      <div class="monitor-meta">
        <span>${escapeHtml(monitor.status)}</span>
        <span>${escapeHtml(normalizeDisplayName(monitor.marketFocus || scan?.markets?.[0]?.name || "auto"))}</span>
      </div>
    </div>
  `;
}

function renderResults() {
  const scan = getActiveScan();
  const monitor = getActiveMonitor();
  results.innerHTML = "";

  if (!scan) {
    results.innerHTML = `
      <div class="results-empty">
        <p class="eyebrow">No Desk Loaded</p>
        <h3>Create a monitor or run a snapshot to build a trend desk.</h3>
        <p>TrendSensor will show source trust, market coverage, trend velocity, and page-level evidence here.</p>
      </div>
    `;
    return;
  }

  const fragment = summaryTemplate.content.cloneNode(true);
  const trendIndex = scan.trendScore ?? scan.overallFreshness ?? 0;
  fragment.querySelector(".score-value").textContent = `${trendIndex}`;
  fragment.querySelector(".score-type").textContent = normalizeDisplayName(scan.trendPosture || "quiet");
  fragment.querySelector(".card-copy").textContent =
    trendIndex >= 70
      ? "High-motion source set. Review evidence, refresh cadence, and monetization fit before acting."
      : "Measured signal. Keep monitoring and avoid over-reading a thin source set.";

  renderMonitorBanner(fragment, monitor, scan);

  const coverage = fragment.querySelector('[data-slot="coverage"]');
  coverage.append(
    createStackItem("Pages Requested", `${scan.scanStats.pagesRequested}`),
    createStackItem("Pages Analyzed", `${scan.scanStats.pagesAnalyzed}`),
    createStackItem("Pages Failed", `${scan.scanStats.pagesFailed}`)
  );

  const markets = fragment.querySelector('[data-slot="markets"]');
  const topMarkets = scan.markets?.length ? scan.markets : [{ name: "unknown", value: 0 }];
  for (const market of topMarkets) {
    markets.append(createStackItem(normalizeDisplayName(market.name), `${market.value} signal(s)`));
  }

  const pulse = fragment.querySelector('[data-slot="pulse"]');
  pulse.append(
    createStackItem("Trend Posture", normalizeDisplayName(scan.trendPosture || "quiet")),
    createStackItem("Freshness", `${scan.overallFreshness}/100`),
    createStackItem("Suggested Cadence", formatMinutes(scan.recommendedRefreshMinutes)),
    createStackItem("Refresh Reason", normalizeDisplayName(scan.refreshReason || "manual"))
  );
  if (monitor?.lastDiff?.summary?.[1]) {
    pulse.append(createStackItem("Latest Change", monitor.lastDiff.summary[1]));
  }

  const opportunities = fragment.querySelector('[data-slot="opportunities"]');
  const sourceCoverage = scan.sourceCoverage?.length ? scan.sourceCoverage : [{ name: "web", value: scan.scanStats.pagesAnalyzed ?? 0 }];
  for (const source of sourceCoverage) {
    opportunities.append(createStackItem(normalizeDisplayName(source.name), `${source.value} page(s)`));
  }

  const rollout = fragment.querySelector('[data-slot="rollout"]');
  const notes = scan.rolloutNotes?.length ? scan.rolloutNotes : ["No rollout notes generated."];
  for (const note of notes) {
    rollout.append(createStackItem("Note", note));
  }

  const pagesSlot = fragment.querySelector('[data-slot="pages"]');
  const trendsSlot = fragment.querySelector('[data-slot="trends"]');
  const trendCards = scan.trendCards?.length ? scan.trendCards : [];

  if (trendCards.length === 0) {
    const card = document.createElement("article");
    card.className = "trend-card";
    card.innerHTML = `
      <p class="eyebrow">Trend Leads</p>
      <h4>No strong trend leads yet.</h4>
      <p class="trend-copy">Add public pages from platform, community, publisher, or search surfaces to build a broader signal set.</p>
    `;
    trendsSlot.append(card);
  }

  for (const trend of trendCards) {
    const card = document.createElement("article");
    card.className = "trend-card";
    const evidence = trend.evidence?.length ? trend.evidence : ["direct page snapshot"];
    card.innerHTML = `
      <div class="trend-head">
        <div>
          <p class="eyebrow">${escapeHtml(trend.source || "Public Web")}</p>
          <h4>${escapeHtml(trend.topic || "Untitled trend")}</h4>
        </div>
        <span class="badge">${escapeHtml(trend.score)}/100</span>
      </div>
      <div class="trend-meta">
        <span>${escapeHtml(normalizeDisplayName(trend.velocity))}</span>
        <span>${escapeHtml(normalizeDisplayName(trend.urgency))}</span>
        <span>${escapeHtml(normalizeDisplayName(trend.market))}</span>
        <span>${escapeHtml(normalizeDisplayName(trend.sourceTrust))}</span>
      </div>
      <p class="trend-copy">${escapeHtml(evidence.join(" | "))}</p>
    `;
    trendsSlot.append(card);
  }

  for (const page of scan.pages) {
    const pageNode = pageTemplate.content.cloneNode(true);

    if (!page.ok) {
      const pageCard = pageNode.querySelector(".page-card");
      pageCard.innerHTML = `
        <div class="page-head">
          <div>
            <p class="page-url">${escapeHtml(page.url)}</p>
            <h4 class="page-title">Fetch Failed</h4>
          </div>
          <span class="badge">error</span>
        </div>
        <div class="risk-card"><p class="risk-copy">${escapeHtml(page.error)}</p></div>
      `;
      pagesSlot.append(pageCard);
      continue;
    }

    pageNode.querySelector(".page-url").textContent = page.finalUrl || page.url;
    pageNode.querySelector(".page-title").textContent = `${normalizeDisplayName(page.siteArchetype)} / ${normalizeDisplayName(page.pageTemplate)}`;
    pageNode.querySelector(".page-markets").textContent = `Markets: ${
      page.markets?.length ? page.markets.map((market) => normalizeDisplayName(market.name)).join(", ") : "unknown"
    } | Trend: ${normalizeDisplayName(page.trend?.velocity || "quiet")} | Freshness: ${page.freshness?.level ?? "low"}`;
    pageNode.querySelector(".badge").textContent = `${page.monetizationScore}/100`;

    const metricRow = pageNode.querySelector(".metric-row");
    const metrics = [
      ["Words", page.metrics.wordCount],
      ["Paragraphs", page.metrics.paragraphCount],
      ["Lists", page.metrics.listItems],
      ["Forms", page.metrics.forms],
      ["Ad Signals", page.metrics.existingAdSignals],
      ["Trend Score", page.trend?.momentumScore ?? 0],
      ["Source", page.trend?.sourceLabel ?? "Public Web"]
    ];

    for (const [name, value] of metrics) {
      const pill = document.createElement("div");
      pill.className = "metric-pill";
      pill.innerHTML = `<span class="metric-title">${escapeHtml(name)}</span><span>${escapeHtml(value)}</span>`;
      metricRow.append(pill);
    }

    const recs = pageNode.querySelector(".recommendations");
    const recItems = page.recommendations?.length
      ? page.recommendations
      : [{ priority: "low", zone: "No recommendation", rationale: "No clear inventory opportunity identified.", action: "" }];

    for (const recommendation of recItems) {
      const card = document.createElement("article");
      card.className = "rec-card";
      card.innerHTML = `
        <span class="rec-priority">${escapeHtml(recommendation.priority)}</span>
        <span class="rec-title">${escapeHtml(recommendation.zone)}</span>
        <p class="rec-copy">${escapeHtml(recommendation.rationale)} ${escapeHtml(recommendation.action || "")}</p>
      `;
      recs.append(card);
    }

    const risks = pageNode.querySelector(".risks");
    const riskItems = page.risks?.length ? page.risks : ["No major risks detected by the ruleset."];
    for (const risk of riskItems) {
      const card = document.createElement("article");
      card.className = "risk-card";
      card.innerHTML = `<span class="risk-tag">risk</span><p class="risk-copy">${escapeHtml(risk)}</p>`;
      risks.append(card);
    }

    pagesSlot.append(pageNode);
  }

  results.append(fragment);
}

function renderAll() {
  renderMonitorList();
  renderHistory();
  renderSourceList();
  renderResults();
}

async function loadState(options = {}) {
  const response = await fetch("/api/state");
  const payload = await response.json();
  state.scans = Array.isArray(payload.scans) ? payload.scans : [];
  state.monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
  state.sources = Array.isArray(payload.sources) ? payload.sources : [];

  if (!state.sourcesDirty) {
    sourcesTextarea.value = JSON.stringify(state.sources, null, 2);
  }

  if (state.activeMonitorId) {
    const currentMonitor = getActiveMonitor();
    if (currentMonitor?.latestScanId) {
      state.activeScanId = currentMonitor.latestScanId;
    }
  }

  if (!state.activeMonitorId && !state.activeScanId) {
    if (state.monitors[0]?.latestScanId) {
      state.activeMonitorId = state.monitors[0].id;
      state.activeScanId = state.monitors[0].latestScanId;
    } else if (state.scans[0]) {
      state.activeScanId = state.scans[0].id;
    }
  }

  renderAll();

  if (!options.silent && payload.refresher) {
    const meta = [];
    if (payload.refresher.lastTickAt) {
      meta.push(`scheduler ${formatDate(payload.refresher.lastTickAt)}`);
    }
    if (payload.refresher.lastError) {
      meta.push(`scheduler error: ${payload.refresher.lastError}`);
    }
    setStatus("Desk state refreshed.", "idle", meta);
  }
}

async function performAction(url, body, successMessage, tone = "success") {
  if (state.loading) {
    return null;
  }

  state.loading = true;
  for (const button of [monitorButton, scanButton, saveSourcesButton, refreshSourcesButton]) {
    button.disabled = true;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    await loadState({ silent: true });
    setStatus(successMessage, tone);
    return payload;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Request failed.", "error");
    return null;
  } finally {
    state.loading = false;
    for (const button of [monitorButton, scanButton, saveSourcesButton, refreshSourcesButton]) {
      button.disabled = false;
    }
  }
}

monitorButton.addEventListener("click", async () => {
  const payload = parseForm();
  setStatus("Creating monitor and capturing the first live snapshot...", "loading");
  const result = await performAction("/api/monitors", payload, "Live monitor created.");
  if (result?.monitor) {
    state.activeMonitorId = result.monitor.id;
    state.activeScanId = result.monitor.latestScanId ?? result.scan?.id ?? state.activeScanId;
    renderAll();
  }
});

scanButton.addEventListener("click", async () => {
  const payload = parseForm();
  setStatus("Running snapshot audit...", "loading");
  const result = await performAction("/api/scan", payload, "Snapshot complete.");
  if (result?.scan) {
    // performAction already refreshed state; just select the new scan.
    state.activeMonitorId = null;
    state.activeScanId = result.scan.id;
    renderAll();
  }
});

sourcesTextarea.addEventListener("input", () => {
  state.sourcesDirty = true;
});

saveSourcesButton.addEventListener("click", async () => {
  let sources;
  try {
    sources = parseSourcesForm();
  } catch {
    setStatus("Sources JSON is invalid.", "error");
    return;
  }

  setStatus("Saving feed sources...", "loading");
  const result = await performAction("/api/sources", { sources }, "Feed sources saved.");
  if (result?.sources) {
    state.sources = result.sources;
    state.sourcesDirty = false;
    sourcesTextarea.value = JSON.stringify(state.sources, null, 2);
    renderAll();
  }
});

refreshSourcesButton.addEventListener("click", async () => {
  let sources;
  try {
    sources = parseSourcesForm();
  } catch {
    setStatus("Sources JSON is invalid.", "error");
    return;
  }

  setStatus("Refreshing feed sources...", "loading");
  const result = await performAction("/api/sources/refresh", { sources }, "Feed snapshot complete.");
  if (result?.scan) {
    state.activeMonitorId = null;
    state.activeScanId = result.scan.id;
    if (result.sources) {
      state.sources = result.sources;
    }
    renderAll();
  }
});

results.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const monitorId = target.dataset.monitorId;
  if (!monitorId) {
    return;
  }

  if (target.dataset.action === "refresh-monitor") {
    setStatus("Refreshing live monitor now...", "loading");
    await performAction(`/api/monitors/${monitorId}/refresh`, {}, "Monitor refreshed.");
    state.activeMonitorId = monitorId;
    return;
  }

  if (target.dataset.action === "toggle-monitor") {
    const status = target.dataset.status;
    setStatus(status === "paused" ? "Pausing monitor..." : "Resuming monitor...", "loading");
    await performAction(`/api/monitors/${monitorId}/status`, { status }, status === "paused" ? "Monitor paused." : "Monitor resumed.");
    state.activeMonitorId = monitorId;
  }
});

scanForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

setInterval(() => {
  if (!state.loading) {
    void loadState({ silent: true });
  }
}, POLL_INTERVAL_MS);

loadState().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Failed to load state.", "error");
});
