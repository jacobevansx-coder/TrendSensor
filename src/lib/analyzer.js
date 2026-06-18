const AD_PATTERNS = [
  /adsbygoogle/i,
  /doubleclick/i,
  /googletag/i,
  /gpt-ad/i,
  /adslot/i,
  /\bad[s_-]?(unit|slot|container|wrapper)\b/i,
  /\bsponsored\b/i,
  /\baffiliate\b/i
];

const KEYWORD_SETS = {
  article: [
    /\bby\b/,
    /\bauthor\b/,
    /\bpublished\b/,
    /\bread more\b/,
    /\bnewsletter\b/,
    /\bsubscribe\b/,
    /\bopinion\b/,
    /\banalysis\b/
  ],
  directory: [/\blisting\b/, /\bdirectory\b/, /\bresults\b/, /\bfilter\b/, /\bcompare\b/, /\bnear me\b/, /\btop \d+\b/, /\brating\b/],
  leadGen: [/\bbook now\b/, /\bschedule\b/, /\bfree estimate\b/, /\brequest service\b/, /\bcall now\b/, /\bcontact us\b/, /\bget quote\b/],
  saas: [/\brequest demo\b/, /\bbook demo\b/, /\bstart free trial\b/, /\bpricing\b/, /\bproduct tour\b/, /\bplatform\b/, /\bfeatures\b/],
  ecommerce: [/\badd to cart\b/, /\bbuy now\b/, /\bcheckout\b/, /\bshipping\b/, /\bsku\b/, /\bproduct details\b/],
  community: [/\bthread\b/, /\breplies\b/, /\bdiscussion\b/, /\bmember\b/, /\bcommunity\b/, /\bforum\b/]
};

const MARKET_SETS = {
  local_services: [/\broof(ing|er)?\b/, /\bhvac\b/, /\bplumb(er|ing)\b/, /\belectric(al|ian)\b/, /\bcontractor\b/, /\bservice area\b/, /\bestimate\b/, /\brepair\b/],
  real_estate: [/\breal estate\b/, /\brealtor\b/, /\bproperty\b/, /\bopen house\b/, /\bmortgage\b/, /\bfor sale\b/, /\bfor rent\b/, /\bmls\b/],
  finance: [/\binvest(ing|ment)\b/, /\bstocks?\b/, /\bportfolio\b/, /\bretirement\b/, /\bcredit card\b/, /\bloan\b/, /\binsurance\b/, /\bbank(ing)?\b/],
  healthcare: [/\bclinic\b/, /\bdoctor\b/, /\bpatient\b/, /\bmedical\b/, /\bdental\b/, /\bhealth\b/, /\bwellness\b/, /\btreatment\b/],
  jobs: [/\bjobs?\b/, /\bcareers?\b/, /\bapply now\b/, /\bresume\b/, /\bemployer\b/, /\bhiring\b/, /\bremote\b/],
  education: [/\bcourse\b/, /\bdegree\b/, /\badmissions?\b/, /\bstudent\b/, /\btraining\b/, /\bcertificate\b/, /\btuition\b/],
  travel: [/\bhotel\b/, /\bflight\b/, /\btravel\b/, /\bitinerary\b/, /\bresort\b/, /\bdestination\b/, /\bbook your stay\b/],
  sports: [/\bscore\b/, /\bschedule\b/, /\bteam\b/, /\bmatch\b/, /\bseason\b/, /\bleague\b/, /\bgame day\b/],
  food: [/\brecipe\b/, /\brestaurant\b/, /\bmenu\b/, /\bdining\b/, /\bdelivery\b/, /\bcuisine\b/],
  technology: [/\bsoftware\b/, /\bdeveloper\b/, /\bcloud\b/, /\bapi\b/, /\bplatform\b/, /\bsaas\b/, /\bautomation\b/],
  legal: [/\battorney\b/, /\blaw firm\b/, /\blegal\b/, /\blitigation\b/, /\bpractice area\b/, /\bcase review\b/],
  automotive: [/\bdealership\b/, /\bdealer\b/, /\bvehicle\b/, /\bauto\b/, /\btruck\b/, /\bcar service\b/, /\bservice center\b/]
};

const MARKET_PLAYBOOKS = {
  local_services: {
    zone: "Service Area Partner Strip",
    type: "house",
    rationale: "Local services monetize better through trusted partner promos, financing offers, and geo-specific upsells than through generic display units.",
    action: "Use a service-area strip for financing, seasonal bundles, warranty plans, or vetted partner offers."
  },
  real_estate: {
    zone: "Featured Property Carousel",
    type: "sponsored_listing",
    rationale: "Real-estate audiences are used to premium inventory around listings, neighborhoods, and lender relationships.",
    action: "Sell promoted properties, lender blocks, or neighborhood sponsor slots near search and listing modules."
  },
  finance: {
    zone: "Research Sponsor Panel",
    type: "sponsorship",
    rationale: "Finance pages are better suited to direct sponsorships and research partners than to aggressive display density.",
    action: "Package newsletter sponsorships, broker comparisons, and premium report slots with disclosure controls."
  },
  healthcare: {
    zone: "Provider Spotlight Shelf",
    type: "sponsorship",
    rationale: "Healthcare pages should emphasize trusted provider spotlights or direct partnerships rather than noisy ad stacks.",
    action: "Offer clearly disclosed provider or service spotlights near directories, education content, or appointment flows."
  },
  jobs: {
    zone: "Featured Employer Slot",
    type: "sponsored_listing",
    rationale: "Job seekers already scan feed-based inventory, so featured employers and promoted roles fit naturally.",
    action: "Insert featured employers into result pages and package them with newsletter or alert sponsorships."
  },
  education: {
    zone: "Course Partner Shelf",
    type: "sponsorship",
    rationale: "Education content can sell adjacent partner schools, certificates, and training sponsors without overloading the page.",
    action: "Reserve a partner shelf near comparison pages, admissions content, and newsletter prompts."
  },
  travel: {
    zone: "Destination Partner Module",
    type: "sponsorship",
    rationale: "Travel users respond well to itinerary partners, nearby attractions, and direct booking relationships.",
    action: "Bundle hotel, tour, insurance, or transport sponsors into destination and itinerary templates."
  },
  sports: {
    zone: "Game Day Sponsor Bar",
    type: "sponsorship",
    rationale: "Sports pages refresh quickly and support high-visibility sponsor takeovers tied to teams or live events.",
    action: "Sell game-day sponsor bars on schedules, scoreboards, and recap content with short refresh cycles."
  },
  food: {
    zone: "Restaurant Partner Module",
    type: "sponsorship",
    rationale: "Food audiences align with sponsor placements around local dining, reservations, delivery, and recipe commerce.",
    action: "Use partner modules for featured restaurants, reservation apps, grocery tie-ins, or kitchen brands."
  },
  technology: {
    zone: "Tool Sponsor Shelf",
    type: "sponsorship",
    rationale: "Technology readers tend to convert on product ecosystems, integrations, and comparison modules rather than generic ads.",
    action: "Package tool sponsors, benchmark reports, and integration showcases near product-led content."
  },
  legal: {
    zone: "Practice Area Partner Shelf",
    type: "house",
    rationale: "Legal pages are high-intent and should protect trust, so use internal offers or carefully disclosed partner placements.",
    action: "Promote consultations, adjacent services, or vetted referral partners without crowding the main CTA path."
  },
  automotive: {
    zone: "Dealer Spotlight Slot",
    type: "sponsored_listing",
    rationale: "Automotive audiences already tolerate promoted inventory around listings, service offers, and financing modules.",
    action: "Place dealer spotlights or financing partners inside inventory, comparison, and service pages."
  }
};

const REGULATED_MARKETS = new Set(["finance", "healthcare", "legal"]);
const FAST_MOVING_MARKETS = new Set(["finance", "sports", "travel"]);

const SOURCE_PATTERNS = [
  { type: "google_trends", label: "Google Trends", pattern: /(^|\.)trends\.google\./i, trust: "official_platform" },
  { type: "google_search", label: "Google Search", pattern: /(^|\.)google\./i, trust: "official_platform" },
  { type: "reddit", label: "Reddit", pattern: /(^|\.)reddit\.com$/i, trust: "platform_page" },
  { type: "youtube", label: "YouTube", pattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, trust: "platform_page" },
  { type: "x", label: "X / Twitter", pattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i, trust: "platform_page" },
  { type: "tiktok", label: "TikTok", pattern: /(^|\.)tiktok\.com$/i, trust: "platform_page" },
  { type: "instagram", label: "Instagram", pattern: /(^|\.)instagram\.com$/i, trust: "platform_page" },
  { type: "linkedin", label: "LinkedIn", pattern: /(^|\.)linkedin\.com$/i, trust: "platform_page" },
  { type: "facebook", label: "Facebook", pattern: /(^|\.)facebook\.com$/i, trust: "platform_page" }
];

const ENTITY_MAP = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "]
]);

function decodeEntities(input) {
  return input.replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP.get(name.toLowerCase()) ?? match);
}

function stripHtml(html) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  return decodeEntities(withoutNoise.replace(/<[^>]+>/g, " "));
}

function countMatches(input, pattern) {
  return (input.match(pattern) ?? []).length;
}

function countKeywordHits(text, patterns) {
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractTitle(html, fallbackUrl) {
  const match =
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ??
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = match ? stripHtml(match[1]).replace(/\s+/g, " ").trim() : "";
  if (raw) {
    return raw.slice(0, 90);
  }

  const url = new URL(fallbackUrl);
  return url.pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replaceAll(/[-_]+/g, " ")
    .slice(0, 90) || url.hostname;
}

function classifySource(url) {
  const host = url.hostname.replace(/^www\./i, "");
  const source = SOURCE_PATTERNS.find((item) => item.pattern.test(host));
  if (source) {
    return source;
  }

  return {
    type: "web",
    label: "Public Web",
    trust: "direct_page"
  };
}

function classifyPageTemplate(signals) {
  const scores = {
    article: 0,
    listing: 0,
    landing: 0,
    product: 0,
    forum: 0,
    home: 0
  };

  if (signals.articleMarkers >= 3) {
    scores.article += 4;
  }
  if (signals.paragraphCount >= 8) {
    scores.article += 3;
  }
  if (signals.wordCount >= 900) {
    scores.article += 2;
  }
  if (signals.listingMarkers >= 3) {
    scores.listing += 4;
  }
  if (signals.listItems >= 12) {
    scores.listing += 3;
  }
  if (signals.formCount >= 1 && signals.ctaCount >= 2) {
    scores.landing += 4;
  }
  if (signals.productMarkers >= 2) {
    scores.product += 4;
  }
  if (signals.communityMarkers >= 2) {
    scores.forum += 4;
  }
  if (signals.heroMarkers >= 1 && signals.paragraphCount <= 5) {
    scores.home += 2;
  }

  return Object.entries(scores).sort((left, right) => right[1] - left[1])[0][0];
}

function classifySiteArchetype(signals, pageTemplate) {
  const scores = {
    publisher: 0,
    directory: 0,
    lead_gen: 0,
    saas: 0,
    ecommerce: 0,
    community: 0
  };

  scores.publisher += signals.articleMarkers + (pageTemplate === "article" ? 3 : 0);
  scores.directory += signals.listingMarkers + (pageTemplate === "listing" ? 3 : 0);
  scores.lead_gen += signals.leadGenMarkers + Math.min(signals.formCount, 3);
  scores.saas += signals.saasMarkers + (signals.ctaCount >= 2 ? 1 : 0);
  scores.ecommerce += signals.productMarkers + (pageTemplate === "product" ? 3 : 0);
  scores.community += signals.communityMarkers + (pageTemplate === "forum" ? 3 : 0);

  if (signals.wordCount >= 1200 && signals.leadGenMarkers === 0 && signals.productMarkers === 0) {
    scores.publisher += 2;
  }
  if (signals.formCount >= 2 && signals.ctaCount >= 3) {
    scores.lead_gen += 2;
  }
  if (signals.priceMarkers >= 1 && signals.saasMarkers >= 2) {
    scores.saas += 2;
  }

  return Object.entries(scores).sort((left, right) => right[1] - left[1])[0][0];
}

function detectMarkets(url, text, focusMarket = "") {
  const urlObject = new URL(url);
  const surface = `${urlObject.hostname} ${urlObject.pathname.replaceAll(/[._/-]+/g, " ")} ${text}`;

  const scored = Object.entries(MARKET_SETS).map(([name, patterns]) => ({
    name,
    score: countKeywordHits(surface, patterns)
  }));

  const focus = focusMarket && MARKET_SETS[focusMarket] ? focusMarket : null;
  if (focus) {
    // ponytail: explicit user Market Focus pins this vertical on top so analysis, recommendations,
    // and freshness all key off markets[0] — even with zero auto-detected signals. Unknown focus
    // values fall back to auto-detect rather than erroring.
    const topScore = Math.max(0, ...scored.map((entry) => entry.score));
    scored.find((entry) => entry.name === focus).score = topScore + 1;
  }

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function buildTrendProfile(url, html, signals, markets, siteArchetype, freshness) {
  const urlObject = new URL(url);
  const source = classifySource(urlObject);
  const topMarket = markets[0]?.name ?? "unknown";
  const title = extractTitle(html, url);
  const recencyScore = Math.min(signals.timeSignals * 12 + signals.recencySignals * 14, 54);
  const discussionScore = Math.min(signals.communityMarkers * 10 + signals.socialMarkers * 8, 28);
  const demandScore = Math.min(signals.searchDemandMarkers * 7 + (FAST_MOVING_MARKETS.has(topMarket) ? 10 : 0), 28);
  const platformBoost = source.type === "web" ? 0 : 8;
  const momentumScore = clampScore(recencyScore + discussionScore + demandScore + platformBoost);
  const velocity =
    momentumScore >= 75 ? "surging" : momentumScore >= 50 ? "building" : momentumScore >= 25 ? "watch" : "quiet";
  const urgency =
    velocity === "surging" ? "act_today" : velocity === "building" ? "watch_daily" : velocity === "watch" ? "watch_weekly" : "archive";
  const evidence = [];

  if (signals.timeSignals > 0) {
    evidence.push("dated or updated page metadata");
  }
  if (signals.recencySignals > 0) {
    evidence.push("recency language in page copy");
  }
  if (signals.communityMarkers > 0 || signals.socialMarkers > 0) {
    evidence.push("discussion or social engagement markers");
  }
  if (signals.searchDemandMarkers > 0) {
    evidence.push("search-intent phrases such as best, compare, top, or near me");
  }
  if (topMarket !== "unknown") {
    evidence.push(`${topMarket.replaceAll("_", " ")} market signals`);
  }

  return {
    topic: title,
    sourceType: source.type,
    sourceLabel: source.label,
    sourceTrust: source.trust,
    market: topMarket,
    momentumScore,
    velocity,
    urgency,
    freshnessLevel: freshness.level,
    evidence: evidence.slice(0, 4)
  };
}

function computeFreshness(signals, siteArchetype, topMarket) {
  let score = 0;
  score += Math.min(signals.timeSignals * 16, 48);
  score += Math.min(signals.recencySignals * 12, 36);
  if (siteArchetype === "publisher") {
    score += 8;
  }
  if (topMarket && FAST_MOVING_MARKETS.has(topMarket)) {
    score += 12;
  }

  const clamped = Math.max(0, Math.min(100, score));
  const level = clamped >= 65 ? "high" : clamped >= 35 ? "medium" : "low";
  const recommendedRefreshMinutes = level === "high" ? 10 : level === "medium" ? 30 : 180;

  return {
    score: clamped,
    level,
    recommendedRefreshMinutes
  };
}

function addRecommendation(recommendations, recommendation) {
  if (recommendations.some((item) => item.zone === recommendation.zone)) {
    return;
  }

  recommendations.push(recommendation);
}

function detectRiskProfile(siteArchetype, signals, topMarket) {
  const risks = [];

  if (siteArchetype === "lead_gen" || siteArchetype === "saas" || siteArchetype === "ecommerce") {
    risks.push("High-intent pages should avoid third-party display ads that compete with conversion goals.");
  }
  if (signals.adSignals >= 5) {
    risks.push("The page already contains several ad markers; aggressive additions could push density or CLS too far.");
  }
  if (signals.formCount >= 2) {
    risks.push("Forms appear multiple times, so monetization should not interrupt the primary action path.");
  }
  if (signals.wordCount < 350 && signals.paragraphCount < 6) {
    risks.push("Short pages have limited inventory; forced placements will likely feel intrusive.");
  }
  if (signals.stickySignals >= 1) {
    risks.push("A sticky element already exists, so any mobile anchor needs UX review.");
  }
  if (topMarket && REGULATED_MARKETS.has(topMarket)) {
    risks.push("This market needs stronger disclosure, source vetting, and partner review before sponsor placements go live.");
  }

  return risks;
}

function buildRecommendations(siteArchetype, pageTemplate, signals, markets) {
  const recommendations = [];
  const thirdPartySafe = !["lead_gen", "saas", "ecommerce"].includes(siteArchetype);
  const topMarket = markets[0]?.name ?? null;

  if (
    (siteArchetype === "publisher" || pageTemplate === "article") &&
    (signals.wordCount >= 700 || signals.paragraphCount >= 10)
  ) {
    addRecommendation(recommendations, {
      zone: "Mid-Article Display",
      priority: "high",
      confidence: 86,
      type: thirdPartySafe ? "display" : "house",
      rationale: "Long-form content can support one or two in-content placements without front-loading clutter.",
      action: "Insert the first slot after paragraph 3 or 4 and a second slot near the 70% scroll mark."
    });
    addRecommendation(recommendations, {
      zone: "End-of-Article Sponsor",
      priority: "high",
      confidence: 81,
      type: thirdPartySafe ? "sponsored" : "house",
      rationale: "The page has enough depth to offer a sponsor or related offer after the reader finishes.",
      action: "Reserve the post-content block for sponsors, newsletter placements, or affiliate callouts."
    });
  }

  if ((siteArchetype === "directory" || pageTemplate === "listing") && signals.listItems >= 8) {
    addRecommendation(recommendations, {
      zone: "In-Feed Sponsored Slot",
      priority: "high",
      confidence: 89,
      type: "sponsored_listing",
      rationale: "Listing pages monetize best by blending paid placements into the feed instead of dropping generic banners around it.",
      action: "Offer featured slots after every 4 to 6 organic results and clearly mark them as sponsored."
    });
    addRecommendation(recommendations, {
      zone: "Premium Category Rail",
      priority: "medium",
      confidence: 72,
      type: "sponsorship",
      rationale: "Directories can sell adjacent sponsorships tied to intent-heavy categories or filters.",
      action: "Use the sidebar or filter column for category sponsors, boosted profiles, or premium badges."
    });
  }

  if (signals.hasSidebar && thirdPartySafe) {
    addRecommendation(recommendations, {
      zone: "Sidebar Rail",
      priority: "medium",
      confidence: 70,
      type: "display",
      rationale: "A sidebar is present and can carry lower-attention placements without breaking the main reading flow.",
      action: "Limit the rail to one sticky unit or a short stack of sponsor placements."
    });
  }

  if ((signals.wordCount >= 600 || signals.paragraphCount >= 10) && thirdPartySafe && signals.stickySignals === 0) {
    addRecommendation(recommendations, {
      zone: "Mobile Anchor",
      priority: "medium",
      confidence: 66,
      type: "display",
      rationale: "Mobile readers on long pages can support a bottom anchor when the rest of the experience stays clean.",
      action: "Use a dismissible bottom anchor only on informational templates, not on checkout or demo flows."
    });
  }

  if (!thirdPartySafe) {
    addRecommendation(recommendations, {
      zone: "Internal Promo Strip",
      priority: "high",
      confidence: 90,
      type: "house",
      rationale: "This page looks conversion-led. Internal offers, upsells, or partner placements are safer than open-network ads.",
      action: "Replace third-party inventory with adjacent offers such as case studies, add-ons, financing, or cross-sells."
    });
  }

  if (signals.newsletterMarkers >= 1) {
    addRecommendation(recommendations, {
      zone: "Newsletter Sponsorship",
      priority: "medium",
      confidence: 74,
      type: "sponsorship",
      rationale: "Email capture suggests a repeat audience that can support direct sponsorship inventory.",
      action: "Package newsletter sponsor mentions together with on-site sponsor blocks."
    });
  }

  if (topMarket && MARKET_PLAYBOOKS[topMarket]) {
    const playbook = MARKET_PLAYBOOKS[topMarket];
    addRecommendation(recommendations, {
      zone: playbook.zone,
      priority: REGULATED_MARKETS.has(topMarket) ? "medium" : "high",
      confidence: REGULATED_MARKETS.has(topMarket) ? 68 : 82,
      type: playbook.type,
      rationale: playbook.rationale,
      action: playbook.action
    });
  }

  return recommendations;
}

function computeMonetizationScore(siteArchetype, pageTemplate, signals, recommendations, markets) {
  let score = 50;
  const topMarket = markets[0]?.name ?? null;

  if (siteArchetype === "publisher") {
    score += 18;
  }
  if (siteArchetype === "directory") {
    score += 20;
  }
  if (siteArchetype === "community") {
    score += 8;
  }
  if (pageTemplate === "article" && (signals.wordCount >= 800 || signals.paragraphCount >= 10)) {
    score += 10;
  }
  if (signals.hasSidebar) {
    score += 5;
  }
  if (signals.adSignals >= 1) {
    score -= 8;
  }
  if (["lead_gen", "saas", "ecommerce"].includes(siteArchetype)) {
    score -= 12;
  }
  if (topMarket && ["jobs", "real_estate", "travel", "sports", "automotive"].includes(topMarket)) {
    score += 6;
  }
  if (topMarket && REGULATED_MARKETS.has(topMarket)) {
    score -= 4;
  }
  score += Math.min(recommendations.length * 4, 16);

  return Math.max(0, Math.min(100, score));
}

export function analyzeHtml(url, html, metadata = {}) {
  const text = stripHtml(html).replace(/\s+/g, " ").trim().toLowerCase();
  const signals = {
    wordCount: text ? text.split(" ").filter(Boolean).length : 0,
    paragraphCount: countMatches(html, /<p\b/gi),
    listItems: countMatches(html, /<li\b/gi),
    formCount: countMatches(html, /<form\b/gi),
    ctaCount: countMatches(text, /\b(sign up|get started|contact us|request demo|book now|call now|get quote|buy now|subscribe)\b/gi),
    adSignals: AD_PATTERNS.reduce((sum, pattern) => sum + countMatches(html, pattern), 0),
    articleMarkers: countKeywordHits(text, KEYWORD_SETS.article) + countMatches(html, /<article\b|application\/ld\+json[\s\S]*?"@type"\s*:\s*"Article"|property="og:type"\s+content="article"/gi),
    listingMarkers: countKeywordHits(text, KEYWORD_SETS.directory) + countMatches(html, /\b(listing|directory|results|filters?)\b/gi),
    leadGenMarkers: countKeywordHits(text, KEYWORD_SETS.leadGen),
    saasMarkers: countKeywordHits(text, KEYWORD_SETS.saas),
    productMarkers: countKeywordHits(text, KEYWORD_SETS.ecommerce),
    communityMarkers: countKeywordHits(text, KEYWORD_SETS.community),
    newsletterMarkers: countMatches(text, /\bnewsletter|subscribe\b/gi),
    priceMarkers: countMatches(text, /\bpricing|plans|per month|\$[0-9]/gi),
    heroMarkers: countMatches(html, /\bhero\b/gi),
    stickySignals: countMatches(html, /\bsticky\b|position:\s*sticky/gi),
    timeSignals: countMatches(html, /<time\b|dateModified|datePublished|last updated/gi),
    recencySignals: countMatches(text, /\btoday\b|\blive\b|\bbreaking\b|\bupdated\b|\bjust in\b|\bnow\b|\blatest\b/gi),
    socialMarkers: countMatches(text, /\b(trending|viral|shares?|likes?|views?|followers?|comments?)\b/gi),
    searchDemandMarkers: countMatches(text, /\b(best|top \d+|compare|near me|how to|what is|vs\.?|versus|reviews?)\b/gi),
    hasSidebar: /<aside\b|class=["'][^"']*(sidebar|rail|widget)/i.test(html)
  };

  const pageTemplate = classifyPageTemplate(signals);
  const siteArchetype = classifySiteArchetype(signals, pageTemplate);
  const markets = detectMarkets(url, text, metadata.marketFocus ?? "");
  const freshness = computeFreshness(signals, siteArchetype, markets[0]?.name ?? null);
  const trend = buildTrendProfile(url, html, signals, markets, siteArchetype, freshness);
  const recommendations = buildRecommendations(siteArchetype, pageTemplate, signals, markets);
  const risks = detectRiskProfile(siteArchetype, signals, markets[0]?.name ?? null);
  const monetizationScore = computeMonetizationScore(siteArchetype, pageTemplate, signals, recommendations, markets);

  return {
    url,
    finalUrl: metadata.finalUrl ?? url,
    fetchedAt: metadata.fetchedAt ?? new Date().toISOString(),
    pageTemplate,
    siteArchetype,
    monetizationScore,
    markets,
    freshness,
    trend,
    metrics: {
      wordCount: signals.wordCount,
      paragraphCount: signals.paragraphCount,
      listItems: signals.listItems,
      forms: signals.formCount,
      existingAdSignals: signals.adSignals,
      recencySignals: signals.recencySignals,
      discussionSignals: signals.communityMarkers + signals.socialMarkers,
      searchDemandSignals: signals.searchDemandMarkers
    },
    recommendations,
    risks
  };
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function countBy(items, selector) {
  return items.reduce((accumulator, item) => {
    const key = selector(item);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function topEntries(counts, limit = 3) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function summarizeTrendCards(pages) {
  return pages
    .filter((page) => page.trend)
    .map((page) => ({
      topic: page.trend.topic,
      source: page.trend.sourceLabel,
      sourceType: page.trend.sourceType,
      sourceTrust: page.trend.sourceTrust,
      market: page.trend.market,
      velocity: page.trend.velocity,
      urgency: page.trend.urgency,
      score: page.trend.momentumScore,
      url: page.finalUrl ?? page.url,
      evidence: page.trend.evidence ?? []
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function classifyTrendPosture(score) {
  if (score >= 75) {
    return "surging";
  }
  if (score >= 50) {
    return "active";
  }
  if (score >= 25) {
    return "watchlist";
  }
  return "quiet";
}

export function summarizeScan(label, pageResults) {
  const successfulPages = pageResults.filter((page) => page.ok);
  const failedPages = pageResults.filter((page) => !page.ok);
  const siteArchetypeCounts = countBy(successfulPages, (page) => page.siteArchetype);
  const templateCounts = countBy(successfulPages, (page) => page.pageTemplate);
  const marketCounts = countBy(
    successfulPages.flatMap((page) => (page.markets ?? []).map((market) => market.name)),
    (market) => market
  );
  const recommendationCounts = countBy(
    successfulPages.flatMap((page) => page.recommendations),
    (recommendation) => recommendation.zone
  );
  const sourceCounts = countBy(successfulPages, (page) => page.trend?.sourceType ?? "web");
  const trendScore = average(successfulPages.map((page) => page.trend?.momentumScore ?? 0));

  return {
    id: crypto.randomUUID(),
    label: label?.trim() || "Untitled Audit",
    createdAt: new Date().toISOString(),
    trendScore,
    trendPosture: classifyTrendPosture(trendScore),
    trendCards: summarizeTrendCards(successfulPages),
    sourceCoverage: topEntries(sourceCounts, 5),
    overallSiteType: topEntries(siteArchetypeCounts, 1)[0]?.name ?? "unknown",
    overallScore: average(successfulPages.map((page) => page.monetizationScore)),
    overallFreshness: average(successfulPages.map((page) => page.freshness?.score ?? 0)),
    recommendedRefreshMinutes: Math.min(
      ...successfulPages.map((page) => page.freshness?.recommendedRefreshMinutes ?? 180),
      180
    ),
    scanStats: {
      pagesRequested: pageResults.length,
      pagesAnalyzed: successfulPages.length,
      pagesFailed: failedPages.length
    },
    opportunities: topEntries(recommendationCounts, 5),
    pageTemplates: topEntries(templateCounts, 5),
    siteTypes: topEntries(siteArchetypeCounts, 5),
    markets: topEntries(marketCounts, 5),
    rolloutNotes: buildRolloutNotes(successfulPages, failedPages),
    pages: pageResults
  };
}

function buildRolloutNotes(successfulPages, failedPages) {
  const notes = [];

  if (successfulPages.some((page) => page.siteArchetype === "directory")) {
    notes.push("Sell sponsored listings and category-level premium placements before adding generic display units.");
  }
  if (successfulPages.some((page) => page.pageTemplate === "article")) {
    notes.push("Treat editorial pages as the main inventory surface: mid-content, end-of-article, and newsletter sponsorships.");
  }
  if (successfulPages.some((page) => ["lead_gen", "saas", "ecommerce"].includes(page.siteArchetype))) {
    notes.push("High-intent templates should use house offers or direct sponsors instead of open-network display ads.");
  }
  if (successfulPages.some((page) => REGULATED_MARKETS.has(page.markets?.[0]?.name ?? ""))) {
    notes.push("Regulated markets need explicit disclosure and tighter partner review before monetized placements go live.");
  }
  if (successfulPages.some((page) => page.freshness?.level === "high")) {
    notes.push("This property looks fast-moving. Short refresh intervals are justified, but keep them lightweight.");
  }
  if (failedPages.length > 0) {
    notes.push("Some pages could not be fetched. Re-run with canonical URLs or behind-auth pages excluded.");
  }

  return notes;
}
