# TrendSensor

TrendSensor is a local-first trend intelligence desk for monitoring public web and platform pages you own or are permitted to audit.

It turns a small watchlist of URLs into evidence-backed trend cards: source type, source trust, market fit, freshness, velocity, monetization fit, and change history over time.

## What It Does

- Runs one-off trend snapshots for up to 8 URLs.
- Creates live monitors that refresh on a controlled cadence.
- Saves a local feed watchlist for Reddit RSS, YouTube channel RSS, and generic RSS/Atom feeds.
- Refreshes feed items into the same trend-card model without Google Cloud, OAuth, or platform credentials.
- Classifies pages by source type: public web, Reddit, YouTube, Google surfaces, X/Twitter, TikTok, Instagram, LinkedIn, Facebook.
- Detects market verticals and lets you pin a market focus when auto-detection is not enough.
- Scores trend momentum from recency, dated metadata, discussion markers, search-demand phrases, and fast-moving markets.
- Keeps page-level evidence with every trend card so the UI does not ask users to trust unexplained scores.
- Tracks monetization fit and safe sponsor/partner opportunities where that is relevant.
- Compares the latest monitor snapshot against the previous one.

## Run

```bash
npm start
```

Open `http://localhost:3000`.

## Local Feed Sources

You do not need Google Cloud or OAuth to monitor known Reddit and YouTube feeds.

In the app, paste source JSON into **Local Feed Watchlist**, save it, then click **Refresh Sources**.

Example:

```json
[
  {
    "type": "reddit_rss",
    "label": "r/artificial hot",
    "url": "https://www.reddit.com/r/artificial/hot/.rss",
    "marketFocus": "technology",
    "limit": 5
  },
  {
    "type": "youtube_rss",
    "label": "YouTube channel feed",
    "url": "https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID",
    "marketFocus": "technology",
    "limit": 5
  }
]
```

A tracked template is available at `data/sources.example.json`. Saved local sources live in `data/sources.json`, which is ignored by git.

Useful feed formats:

- Reddit hot feed: `https://www.reddit.com/r/SUBREDDIT/hot/.rss`
- Reddit new feed: `https://www.reddit.com/r/SUBREDDIT/new/.rss`
- YouTube channel feed: `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`

## Test

```bash
npm test
```

## Safety Model

TrendSensor fetches URLs, so it treats source trust and request safety as product requirements.

- Private, loopback, link-local, multicast, and reserved IP ranges are blocked by default.
- Hostnames are DNS-resolved and validated before fetch.
- Connections are pinned to the validated IP to close the normal DNS rebinding window.
- Redirect targets are revalidated before each hop.
- Local/private scans require explicit opt-in:

```bash
set TREND_SENSOR_ALLOW_PRIVATE_TARGETS=1
npm start
```

Use it only on sources you own, manage, or are allowed to audit.

## Configuration

```bash
set PORT=3000
set TREND_SENSOR_DATA_DIR=D:\TrendSensorData
set TREND_SENSOR_ALLOW_PRIVATE_TARGETS=1
```

`TREND_SENSOR_DATA_DIR` is optional. Without it, data is stored in `data/` under the app root.

## Current Architecture

- Node.js standard library only.
- Native `http` server.
- Static HTML/CSS/JS frontend.
- JSON-file persistence with atomic writes.
- Per-monitor in-process single-flight plus cross-process advisory file locks.
- Rule-based analyzer designed to be deterministic and easy to extend.

## Honest Limits

- This is not using official Google Trends, Reddit, X, YouTube, or TikTok APIs yet. Today it analyzes public URLs and recognized platform pages.
- Local feed mode monitors known feeds; it does not perform platform-wide YouTube search or Reddit corpus search.
- Google Trends does not have a credential-free local API path here. Use public Trends URLs/manual exports until official API access is available.
- File storage is good for a local workstation or single small deployment. SQLite is the next practical step before Postgres.
- Cross-process lock staleness is time-based. It is sized above the current scan budget, but a DB lease or row lock is the production upgrade.
- Scores are deterministic heuristics, not claims of absolute demand.

## Roadmap

The next high-leverage additions are:

- First-class watchlists for topics, brands, competitors, geographies, and sources.
- Official API adapters or licensed providers for Google Trends, Reddit, YouTube, X, and news sources.
- SQLite storage for queryable trend history.
- Alert rules for velocity jumps, cross-source confirmation, and decaying trends.
- Evidence drilldowns that keep every chart tied to the source page or API payload that produced it.
- Exportable briefing reports for professional trend review.

## License

MIT. See `LICENSE`.
