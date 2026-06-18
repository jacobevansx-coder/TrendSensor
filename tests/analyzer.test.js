import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { utimes } from "node:fs/promises";
import { analyzeHtml, summarizeScan } from "../src/lib/analyzer.js";
import { parseScanRequest, isPrivateHost, resolveRefreshReason } from "../src/lib/scan-service.js";
import { parseMonitorRequest, shouldRefreshMonitor, singleFlight, highestPriorityReason } from "../src/lib/monitor-service.js";
import { resolveDataDir, acquireLock } from "../src/lib/storage.js";
import { isBlockedIp, isBlockedHostname } from "../src/lib/host-policy.js";
import { assertUrlAllowed, buildLookup, fetchPage } from "../src/lib/fetcher.js";
import { summarizeMonitorChanges } from "../src/lib/diff.js";
import { createAppServer } from "../src/server.js";
import { parseFeedItems, parseSourcesRequest, refreshSources } from "../src/lib/source-service.js";

test("publisher article pages get editorial inventory recommendations", () => {
  const html = `
    <html>
      <body>
        <article>
          <h1>How Austin's local makers are growing online</h1>
          <p>By Staff Writer</p>
          <p>Published April 1</p>
          <aside class="sidebar"></aside>
          ${"<p>Long editorial body with newsletter mention and more context.</p>".repeat(16)}
          <div>Subscribe to our newsletter</div>
        </article>
      </body>
    </html>
  `;

  const result = analyzeHtml("https://example.com/story", html);

  assert.equal(result.siteArchetype, "publisher");
  assert.equal(result.pageTemplate, "article");
  assert.ok(result.recommendations.some((recommendation) => recommendation.zone === "Mid-Article Display"));
  assert.ok(result.recommendations.some((recommendation) => recommendation.zone === "End-of-Article Sponsor"));
});

test("lead gen pages favor house promos over third-party inventory", () => {
  const html = `
    <html>
      <body>
        <section class="hero">
          <h1>Emergency roof repair in Dallas</h1>
          <p>Call now for a free estimate and schedule same-day service.</p>
          <form><input type="text" /><button>Book now</button></form>
          <form><input type="text" /><button>Get quote</button></form>
        </section>
      </body>
    </html>
  `;

  const result = analyzeHtml("https://example.com/roofing", html);

  assert.equal(result.siteArchetype, "lead_gen");
  assert.ok(result.recommendations.some((recommendation) => recommendation.zone === "Internal Promo Strip"));
  assert.ok(result.risks.some((risk) => risk.includes("avoid third-party display ads")));
});

test("directory pages surface sponsored listing opportunities", () => {
  const html = `
    <html>
      <body>
        <div class="directory">
          <h1>Best HVAC companies near me</h1>
          <div class="filters">Filter by rating</div>
          <ul>
            ${"<li>Listing item with rating and location</li>".repeat(18)}
          </ul>
        </div>
      </body>
    </html>
  `;

  const result = analyzeHtml("https://example.com/directory", html);

  assert.equal(result.siteArchetype, "directory");
  assert.equal(result.pageTemplate, "listing");
  assert.ok(result.recommendations.some((recommendation) => recommendation.zone === "In-Feed Sponsored Slot"));
});

test("scan summaries aggregate site type and opportunity counts", () => {
  const scan = summarizeScan("Test", [
    {
      ok: true,
      ...analyzeHtml(
        "https://example.com/story",
        `<article>${"<p>Long form body and subscribe notice.</p>".repeat(15)}</article>`
      )
    },
    {
      ok: false,
      url: "https://example.com/private",
      error: "Fetch failed with HTTP 403"
    }
  ]);

  assert.equal(scan.scanStats.pagesRequested, 2);
  assert.equal(scan.scanStats.pagesAnalyzed, 1);
  assert.equal(scan.scanStats.pagesFailed, 1);
  assert.ok(scan.rolloutNotes.some((note) => note.includes("could not be fetched")));
});

test("scan request parsing normalizes and validates URLs", () => {
  const parsed = parseScanRequest({
    label: "  Demo  ",
    urls: ["example.com", "https://example.com#about", "example.com"]
  });

  assert.equal(parsed.label, "Demo");
  assert.deepEqual(parsed.urls, ["https://example.com/"]);
  assert.throws(() => parseScanRequest({ urls: ["ftp://example.com"] }), /Invalid URL/);
});

test("finance pages get market-specific playbooks and regulated risk notes", () => {
  const html = `
    <html>
      <body>
        <article>
          <h1>Best retirement portfolios for 2026</h1>
          <time datetime="2026-04-24">Today</time>
          <p>Latest live market analysis and updated stock outlook.</p>
          <p>Compare investing accounts and credit card rewards.</p>
          ${"<p>Deeper market commentary for income investors.</p>".repeat(10)}
        </article>
      </body>
    </html>
  `;

  const result = analyzeHtml("https://example.com/investing/retirement", html);

  assert.equal(result.markets[0].name, "finance");
  assert.ok(result.recommendations.some((recommendation) => recommendation.zone === "Research Sponsor Panel"));
  assert.ok(result.risks.some((risk) => risk.includes("disclosure")));
  assert.equal(result.freshness.level, "high");
});

test("platform pages produce evidence-backed trend profiles", () => {
  const html = `
    <html>
      <body>
        <article>
          <h1>AI automation tools are trending with remote developers</h1>
          <time datetime="2026-06-18">Today</time>
          <p>Latest discussion with live comments, shares, views, and top tool comparisons.</p>
          <p>Compare cloud automation APIs, developer workflows, and software platforms.</p>
          ${"<p>Replies discuss pricing, integrations, and product velocity.</p>".repeat(8)}
        </article>
      </body>
    </html>
  `;

  const result = analyzeHtml("https://www.reddit.com/r/technology/comments/abc/ai_automation_tools", html, {
    marketFocus: "technology"
  });

  assert.equal(result.trend.sourceType, "reddit");
  assert.equal(result.trend.sourceTrust, "platform_page");
  assert.equal(result.trend.market, "technology");
  assert.ok(result.trend.momentumScore >= 50);
  assert.ok(result.trend.evidence.some((item) => item.includes("recency")));
});

test("scan summaries surface trend cards and source coverage", () => {
  const scan = summarizeScan("Trend Desk", [
    {
      ok: true,
      ...analyzeHtml(
        "https://www.youtube.com/watch?v=abc",
        `<html><body><h1>Top travel spots trending today</h1><time>Today</time><p>Latest views, comments, and reviews for destination travel.</p></body></html>`,
        { marketFocus: "travel" }
      )
    }
  ]);

  assert.ok(scan.trendScore > 0);
  assert.equal(scan.trendPosture, "surging");
  assert.equal(scan.trendCards[0].source, "YouTube");
  assert.equal(scan.trendCards[0].market, "travel");
  assert.ok(scan.sourceCoverage.some((entry) => entry.name === "youtube"));
});

test("source requests normalize feed URLs and infer platform types", () => {
  const sources = parseSourcesRequest({
    sources: [
      {
        label: "  Reddit AI  ",
        url: "https://www.reddit.com/r/artificial/hot/.rss#ignored",
        limit: 99,
        marketFocus: "technology"
      },
      {
        label: "YT",
        url: "https://www.youtube.com/feeds/videos.xml?channel_id=abc",
        limit: "not a number",
        marketFocus: "technology"
      }
    ]
  });

  assert.equal(sources[0].type, "reddit_rss");
  assert.equal(sources[0].label, "Reddit AI");
  assert.equal(sources[0].limit, 8);
  assert.equal(sources[0].url, "https://www.reddit.com/r/artificial/hot/.rss");
  assert.equal(sources[1].type, "youtube_rss");
  assert.equal(sources[1].limit, 5);
  assert.throws(() => parseSourcesRequest({ sources: [] }), /source feed/);
});

test("feed parser handles Atom and RSS entries", () => {
  const source = {
    id: "s1",
    type: "youtube_rss",
    label: "YT",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=abc",
    limit: 5
  };
  const atom = `
    <feed>
      <entry>
        <id>yt:video:abc</id>
        <title>AI tools trending today</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=abc" />
        <published>2026-06-18T10:00:00Z</published>
        <media:description>Latest views and comments</media:description>
        <media:statistics views="12345" />
      </entry>
    </feed>
  `;
  const rss = `
    <rss><channel><item>
      <title><![CDATA[Reddit thread: compare AI coding tools]]></title>
      <link>https://www.reddit.com/r/artificial/comments/abc/thread/</link>
      <pubDate>Thu, 18 Jun 2026 10:00:00 GMT</pubDate>
      <description>42 comments and active discussion</description>
    </item></channel></rss>
  `;

  assert.equal(parseFeedItems(atom, source)[0].views, "12345");
  assert.equal(parseFeedItems(rss, { ...source, type: "reddit_rss" })[0].comments, "42");
});

test("source refresh converts local RSS feed items into a saved trend snapshot", async () => {
  process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS = "1";
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
    response.end(`
      <rss><channel>
        <item>
          <title>Top AI automation tools trending today</title>
          <link>https://www.reddit.com/r/artificial/comments/abc/tools/</link>
          <pubDate>Thu, 18 Jun 2026 10:00:00 GMT</pubDate>
          <description>Latest comments, views, and compare discussion for developer software platforms.</description>
        </item>
      </channel></rss>
    `);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const result = await refreshSources({
      sources: [
        {
          type: "rss",
          label: "Local RSS",
          url: `http://127.0.0.1:${port}/feed.xml`,
          marketFocus: "technology",
          limit: 3
        }
      ]
    });

    assert.equal(result.scan.sourceMode, "feed");
    assert.equal(result.scan.sourceStats.itemsCollected, 1);
    assert.equal(result.scan.trendCards[0].source, "Reddit");
    assert.equal(result.scan.trendCards[0].market, "technology");
  } finally {
    server.close();
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS;
  }
});

test("monitor request parsing validates cadence and keeps market focus", () => {
  const parsed = parseMonitorRequest({
    label: "  Live Desk  ",
    urls: ["example.com/news"],
    refreshMinutes: "30",
    marketFocus: "sports"
  });

  assert.equal(parsed.label, "Live Desk");
  assert.equal(parsed.refreshMinutes, 30);
  assert.equal(parsed.marketFocus, "sports");
  assert.throws(() => parseMonitorRequest({ urls: ["example.com"], refreshMinutes: "2" }), /Refresh cadence/);
});

test("monitor diff summarises material opportunity changes", () => {
  const previousScan = {
    overallScore: 68,
    opportunities: [{ name: "Sidebar Rail", value: 1 }],
    pages: [
      {
        ok: true,
        finalUrl: "https://example.com/story",
        monetizationScore: 68,
        recommendations: [{ zone: "Sidebar Rail" }],
        siteArchetype: "publisher"
      }
    ]
  };

  const currentScan = {
    overallScore: 79,
    opportunities: [
      { name: "Sidebar Rail", value: 1 },
      { name: "Mid-Article Display", value: 1 }
    ],
    pages: [
      {
        ok: true,
        finalUrl: "https://example.com/story",
        monetizationScore: 79,
        recommendations: [{ zone: "Sidebar Rail" }, { zone: "Mid-Article Display" }],
        siteArchetype: "publisher"
      }
    ]
  };

  const diff = summarizeMonitorChanges(previousScan, currentScan);

  assert.equal(diff.scoreDelta, 11);
  assert.ok(diff.newOpportunities.includes("Mid-Article Display"));
  assert.ok(diff.changedPages[0].summary.includes("score up 11"));
  assert.equal(diff.significant, true);
});

test("monitor scheduler only refreshes due active monitors", () => {
  const activeDue = {
    status: "active",
    nextRunAt: new Date(Date.now() - 60_000).toISOString()
  };
  const pausedDue = {
    status: "paused",
    nextRunAt: new Date(Date.now() - 60_000).toISOString()
  };

  assert.equal(shouldRefreshMonitor(activeDue), true);
  assert.equal(shouldRefreshMonitor(pausedDue), false);
});

test("market focus overrides auto-detected market and its recommendations", () => {
  const html = `
    <html><body><article>
      <h1>Best retirement portfolios for 2026</h1>
      <p>Compare investing accounts, stocks, and credit card rewards.</p>
      ${"<p>Deeper market commentary for income investors.</p>".repeat(10)}
    </article></body></html>
  `;

  const auto = analyzeHtml("https://example.com/investing", html);
  assert.equal(auto.markets[0].name, "finance");

  const focused = analyzeHtml("https://example.com/investing", html, { marketFocus: "sports" });
  assert.equal(focused.markets[0].name, "sports");
  assert.ok(focused.recommendations.some((rec) => rec.zone === "Game Day Sponsor Bar"));

  // Unknown focus falls back to auto-detect instead of erroring.
  const bogus = analyzeHtml("https://example.com/investing", html, { marketFocus: "not_a_market" });
  assert.equal(bogus.markets[0].name, "finance");
});

test("private and loopback hosts are blocked by default", () => {
  assert.equal(isPrivateHost("127.0.0.1"), true);
  assert.equal(isPrivateHost("localhost"), true);
  assert.equal(isPrivateHost("169.254.169.254"), true);
  assert.equal(isPrivateHost("10.0.0.5"), true);
  assert.equal(isPrivateHost("192.168.1.1"), true);
  assert.equal(isPrivateHost("[::1]"), true);
  assert.equal(isPrivateHost("box.internal"), true);
  assert.equal(isPrivateHost("example.com"), false);
  assert.equal(isPrivateHost("8.8.8.8"), false);

  assert.throws(() => parseScanRequest({ urls: ["http://127.0.0.1/admin"] }), /private or loopback/);
  assert.throws(() => parseScanRequest({ urls: ["http://169.254.169.254/latest/meta-data"] }), /private or loopback/);
  assert.throws(() => parseScanRequest({ urls: ["http://[::1]/"] }), /private or loopback/);
  assert.deepEqual(parseScanRequest({ urls: ["example.com"] }).urls, ["https://example.com/"]);
});

test("allow-private-hosts flag re-enables local scans", () => {
  process.env.TREND_SENSOR_ALLOW_PRIVATE_HOSTS = "1";
  try {
    assert.deepEqual(parseScanRequest({ urls: ["http://localhost:3000"] }).urls, ["http://localhost:3000/"]);
  } finally {
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_HOSTS;
  }
});

test("data dir is anchored to the app root, not caller cwd", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  assert.equal(resolveDataDir({}), path.join(repoRoot, "data"));
  assert.equal(resolveDataDir({ TREND_SENSOR_DATA_DIR: path.resolve("/tmp/ts-data") }), path.resolve("/tmp/ts-data"));
});

test("single-flight coalesces concurrent calls and releases the lock", async () => {
  const locks = new Map();
  let calls = 0;
  const task = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return calls;
  };

  const [a, b] = await Promise.all([singleFlight(locks, "m1", task), singleFlight(locks, "m1", task)]);
  assert.equal(calls, 1, "concurrent calls for the same key run the task once");
  assert.equal(a, b);
  assert.equal(locks.size, 0, "lock is released after settle");

  await singleFlight(locks, "m1", task);
  assert.equal(calls, 2, "a later call runs the task again");
});

test("malformed JSON body returns 400, not 500", async () => {
  const server = createAppServer({ refresher: { getStatus: () => null } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const status = await new Promise((resolve, reject) => {
      const request = http.request(
        { host: "127.0.0.1", port, method: "POST", path: "/api/scan", headers: { "content-type": "application/json" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        }
      );
      request.on("error", reject);
      request.end("{not valid json");
    });

    assert.equal(status, 400);
  } finally {
    server.close();
  }
});

test("isBlockedIp covers private, loopback, link-local, multicast, and reserved ranges", () => {
  for (const ip of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.5.5",
    "192.168.1.1",
    "224.0.0.1",
    "255.255.255.255"
  ]) {
    assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
    assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
  }

  // IPv6 via stdlib canonicalisation: expanded loopback, compressed forms, and IPv4-mapped private.
  for (const ip of ["::1", "0:0:0:0:0:0:0:1", "::", "fe80::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
  }
  // Public addresses — including a v4-mapped public address — stay allowed.
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  assert.equal(isBlockedIp("::ffff:8.8.8.8"), false);
});

test("isBlockedHostname blocks local names and IP literals, allows public DNS names", () => {
  assert.equal(isBlockedHostname("[0:0:0:0:0:0:0:1]"), true); // canonical loopback, bracketed
  assert.equal(isBlockedHostname("foo.lan"), true);
  assert.equal(isBlockedHostname("metadata.google.internal"), true);
  assert.equal(isBlockedHostname("example.com"), false);
});

test("assertUrlAllowed re-validates the scheme, literal, and every resolved address", async () => {
  await assert.rejects(assertUrlAllowed(new URL("http://10.0.0.5/")), /private or loopback/);
  await assert.rejects(assertUrlAllowed(new URL("ftp://example.com/")), /non-http/);

  // DNS name that resolves to a private address is blocked.
  const privateLookup = async () => [{ address: "169.254.169.254", family: 4 }];
  await assert.rejects(assertUrlAllowed(new URL("http://innocent.example/"), privateLookup), /resolves to/);

  // DNS name that resolves to a public address is allowed and returns that address to pin.
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.equal(await assertUrlAllowed(new URL("http://innocent.example/"), publicLookup), "93.184.216.34");

  // A public literal pins to itself.
  assert.equal(await assertUrlAllowed(new URL("http://93.184.216.34/")), "93.184.216.34");
});

test("buildLookup pins every connection to the validated IP (no DNS rebinding)", () => {
  const pinned = buildLookup("203.0.113.7"); // any hostname must map only to this address

  const all = [];
  pinned("attacker-controlled.example", { all: true }, (error, result) => all.push([error, result]));
  assert.deepEqual(all[0], [null, [{ address: "203.0.113.7", family: 4 }]]);

  const single = [];
  pinned("attacker-controlled.example", {}, (error, address, family) => single.push([error, address, family]));
  assert.deepEqual(single[0], [null, "203.0.113.7", 4]);

  assert.equal(buildLookup(null), undefined); // local/allow mode -> default DNS
});

test("assertUrlAllowed is bypassed only by the allow-private-targets flag", async () => {
  await assert.rejects(assertUrlAllowed(new URL("http://127.0.0.1/")), /private or loopback/);

  process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS = "1";
  try {
    await assert.doesNotReject(assertUrlAllowed(new URL("http://127.0.0.1/")));
  } finally {
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS;
  }
});

test("canonical allow-private-targets flag re-enables local scans", () => {
  process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS = "1";
  try {
    assert.deepEqual(parseScanRequest({ urls: ["http://localhost:3000"] }).urls, ["http://localhost:3000/"]);
  } finally {
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS;
  }
});

test("fetchPage follows redirects to the final HTML target", async () => {
  process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS = "1";
  const server = http.createServer((request, response) => {
    if (request.url === "/final") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<html><body><p>done</p></body></html>");
    } else {
      response.writeHead(302, { location: "/final" });
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const result = await fetchPage(`http://127.0.0.1:${port}/start`);
    assert.match(result.html, /done/);
    assert.match(result.finalUrl, /\/final$/);
    assert.equal(result.status, 200);
  } finally {
    server.close();
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS;
  }
});

test("fetchPage enforces a redirect limit", async () => {
  process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS = "1";
  let hop = 0;
  const server = http.createServer((request, response) => {
    hop += 1;
    response.writeHead(302, { location: `/step${hop}` });
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    await assert.rejects(fetchPage(`http://127.0.0.1:${port}/start`, { maxRedirects: 2 }), /Too many redirects/);
  } finally {
    server.close();
    delete process.env.TREND_SENSOR_ALLOW_PRIVATE_TARGETS;
  }
});

test("acquireLock serialises holders and releases", async () => {
  const name = `test-${Date.now()}`;
  const first = await acquireLock(name, { waitMs: 50 });
  assert.ok(first);

  const second = await acquireLock(name, { waitMs: 50 });
  assert.equal(second, null, "second acquire is blocked while the lock is held");

  await first.release();
  const third = await acquireLock(name, { waitMs: 50 });
  assert.ok(third, "acquire succeeds after release");
  await third.release();
});

test("acquireLock reclaims a stale lock so a dead process cannot brick a monitor", async () => {
  const name = `stale-${Date.now()}`;
  const held = await acquireLock(name, { waitMs: 50 });
  assert.ok(held);

  const past = new Date(Date.now() - 10 * 60_000);
  await utimes(held.path, past, past);

  const stolen = await acquireLock(name, { waitMs: 50, staleMs: 60_000 });
  assert.ok(stolen, "a lock older than staleMs is reclaimed");
  await stolen.release();
});

test("coalesced refresh reason keeps the highest priority (manual > initial > scheduled)", () => {
  assert.equal(highestPriorityReason(new Set(["scheduled", "manual"])), "manual");
  assert.equal(highestPriorityReason(new Set(["scheduled", "initial"])), "initial");
  assert.equal(highestPriorityReason(new Set(["scheduled"])), "scheduled");
  assert.equal(highestPriorityReason(new Set()), "manual");
});

test("refreshReason is resolved late so a thunk can capture the winning reason", () => {
  assert.equal(resolveRefreshReason(() => "manual"), "manual");
  assert.equal(resolveRefreshReason("scheduled"), "scheduled");
  assert.equal(resolveRefreshReason(undefined), "manual");
});
