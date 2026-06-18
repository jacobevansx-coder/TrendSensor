import { analyzeHtml, summarizeScan } from "./analyzer.js";
import { fetchText } from "./fetcher.js";
import { normalizeUrl } from "./scan-service.js";
import { listSources, saveScan, saveSources } from "./storage.js";

const SOURCE_TYPES = new Set(["youtube_rss", "reddit_rss", "rss", "atom"]);
const MAX_SOURCES = 12;
const MAX_ITEMS_PER_SOURCE = 8;
const MAX_ITEMS_PER_REFRESH = 32;
const FEED_ACCEPT = "application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain,*/*";
const FEED_CONTENT_TYPE = /xml|rss|atom|text\/plain/i;

const ENTITY_MAP = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "]
]);

function decodeEntities(input) {
  return String(input ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (match, code) => decodeCodePoint(match, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => decodeCodePoint(match, Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP.get(name.toLowerCase()) ?? match);
}

function decodeCodePoint(fallback, value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
}

function stripTags(input) {
  return decodeEntities(input).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstTag(block, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${escapeRegExp(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(name)}>`, "i");
    const match = pattern.exec(block);
    if (match) {
      return stripTags(match[1]);
    }
  }
  return "";
}

function firstLink(block) {
  const atom = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
  if (atom) {
    return decodeEntities(atom[1]).trim();
  }
  return firstTag(block, ["link"]);
}

function entryBlocks(xml) {
  const atomEntries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  if (atomEntries.length > 0) {
    return atomEntries;
  }
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
}

function inferSourceType(url, fallback = "rss") {
  const host = new URL(url).hostname.replace(/^www\./i, "");
  if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) {
    return "youtube_rss";
  }
  if (host.endsWith("reddit.com")) {
    return "reddit_rss";
  }
  return SOURCE_TYPES.has(fallback) ? fallback : "rss";
}

function normalizeLimit(value) {
  const number = Number(value ?? 5);
  if (!Number.isFinite(number)) {
    return 5;
  }
  return Math.max(1, Math.min(MAX_ITEMS_PER_SOURCE, Math.round(number)));
}

function normalizeSource(rawSource, index) {
  const url = normalizeUrl(rawSource?.url);
  if (!url) {
    throw new Error("Invalid source feed URL.");
  }
  const type = inferSourceType(url, String(rawSource?.type ?? "rss").trim());
  if (!SOURCE_TYPES.has(type)) {
    throw new Error(`Unsupported source type: ${rawSource?.type}`);
  }

  return {
    id: String(rawSource?.id ?? `${type}-${index + 1}`).trim().slice(0, 80),
    type,
    label: String(rawSource?.label ?? new URL(url).hostname).trim().slice(0, 100),
    url,
    marketFocus: String(rawSource?.marketFocus ?? "").trim(),
    limit: normalizeLimit(rawSource?.limit)
  };
}

export function parseSourcesRequest(body) {
  const rawSources = Array.isArray(body) ? body : body?.sources;
  const sources = (Array.isArray(rawSources) ? rawSources : []).map(normalizeSource);

  if (sources.length === 0) {
    throw new Error("Provide at least one source feed.");
  }
  if (sources.length > MAX_SOURCES) {
    throw new Error(`Limit source feeds to ${MAX_SOURCES}.`);
  }

  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.type}:${source.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function parseFeedItems(xml, source, limit = source.limit ?? 5) {
  return entryBlocks(String(xml ?? ""))
    .map((block) => {
      const title = firstTag(block, ["title"]);
      const url = firstLink(block) || source.url;
      const publishedAt = firstTag(block, ["published", "updated", "pubDate", "dc:date"]);
      const description = firstTag(block, ["media:description", "summary", "description", "content"]);
      const id = firstTag(block, ["id", "guid"]) || url || title;
      const views = /views=["']?([0-9,]+)/i.exec(block)?.[1] ?? "";
      const comments = /([0-9,]+)\s+comments?/i.exec(stripTags(block))?.[1] ?? "";

      return {
        id,
        title,
        url,
        publishedAt,
        description,
        views,
        comments
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, limit);
}

function feedItemToHtml(item, source) {
  const metrics = [
    item.views ? `${item.views} views` : "",
    item.comments ? `${item.comments} comments` : "",
    source.type.includes("reddit") ? "reddit discussion" : "",
    source.type.includes("youtube") ? "youtube video" : ""
  ]
    .filter(Boolean)
    .join(", ");

  return `
    <html>
      <body>
        <article>
          <h1>${escapeHtml(item.title)}</h1>
          ${item.publishedAt ? `<time datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(item.publishedAt)}</time>` : ""}
          <p>Latest feed item from ${escapeHtml(source.label)}. ${escapeHtml(metrics)}</p>
          <p>${escapeHtml(item.description)}</p>
          <p>Source watchlist feed for trend monitoring, comments, views, shares, replies, and market movement.</p>
        </article>
      </body>
    </html>
  `;
}

async function refreshSource(source) {
  const feed = await fetchText(source.url, {
    accept: FEED_ACCEPT,
    contentTypePattern: FEED_CONTENT_TYPE,
    maxBytes: 1_000_000
  });
  const items = parseFeedItems(feed.text, source, source.limit);

  if (items.length === 0) {
    return [
      {
        ok: false,
        url: source.url,
        error: "No feed items found."
      }
    ];
  }

  return items.map((item) => ({
    ok: true,
    sourceId: source.id,
    sourceLabel: source.label,
    sourceType: source.type,
    feedPublishedAt: item.publishedAt || null,
    ...analyzeHtml(item.url, feedItemToHtml(item, source), {
      finalUrl: item.url,
      fetchedAt: new Date().toISOString(),
      marketFocus: source.marketFocus
    })
  }));
}

export async function saveSourcesFromRequest(body) {
  const sources = parseSourcesRequest(body);
  await saveSources(sources);
  return sources;
}

export async function refreshSources(input = {}) {
  const sources = input.sources ? parseSourcesRequest(input) : parseSourcesRequest(await listSources());
  const results = [];

  for (const source of sources) {
    try {
      results.push(...(await refreshSource(source)));
    } catch (error) {
      results.push({
        ok: false,
        url: source.url,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceType: source.type,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (results.length >= MAX_ITEMS_PER_REFRESH) {
      break;
    }
  }

  const scan = {
    ...summarizeScan(input.label ?? "Source Feed Snapshot", results.slice(0, MAX_ITEMS_PER_REFRESH)),
    sourceMode: "feed",
    sourceStats: {
      sourcesRequested: sources.length,
      itemsCollected: results.filter((item) => item.ok).length,
      sourceErrors: results.filter((item) => !item.ok).length
    },
    marketFocus: "",
    monitorId: null,
    refreshReason: "source_feed"
  };

  await saveScan(scan);
  return { scan, sources };
}
