function mapOpportunities(scan) {
  return new Map((scan.opportunities ?? []).map((item) => [item.name, item.value]));
}

function mapPages(scan) {
  return new Map(
    (scan.pages ?? [])
      .filter((page) => page.ok)
      .map((page) => [
        page.finalUrl ?? page.url,
        {
          score: page.monetizationScore,
          opportunities: new Set((page.recommendations ?? []).map((recommendation) => recommendation.zone)),
          siteArchetype: page.siteArchetype
        }
      ])
  );
}

function summarizePageChanges(previousPages, currentPages) {
  const changes = [];

  for (const [url, current] of currentPages.entries()) {
    const previous = previousPages.get(url);
    if (!previous) {
      changes.push({
        url,
        type: "new_page",
        scoreDelta: current.score,
        summary: "New page entered the monitored set."
      });
      continue;
    }

    const scoreDelta = current.score - previous.score;
    const addedZones = [...current.opportunities].filter((zone) => !previous.opportunities.has(zone));
    const removedZones = [...previous.opportunities].filter((zone) => !current.opportunities.has(zone));
    const typeChanged = current.siteArchetype !== previous.siteArchetype;

    if (scoreDelta !== 0 || addedZones.length || removedZones.length || typeChanged) {
      changes.push({
        url,
        type: "changed_page",
        scoreDelta,
        addedZones,
        removedZones,
        typeChanged,
        summary: buildPageSummary(scoreDelta, addedZones, removedZones, typeChanged)
      });
    }
  }

  for (const [url] of previousPages.entries()) {
    if (!currentPages.has(url)) {
      changes.push({
        url,
        type: "missing_page",
        scoreDelta: 0,
        summary: "Page no longer returned a successful scan result."
      });
    }
  }

  return changes.sort((left, right) => Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta)).slice(0, 5);
}

function buildPageSummary(scoreDelta, addedZones, removedZones, typeChanged) {
  const segments = [];

  if (scoreDelta !== 0) {
    segments.push(`score ${scoreDelta > 0 ? "up" : "down"} ${Math.abs(scoreDelta)}`);
  }
  if (addedZones.length > 0) {
    segments.push(`new zones: ${addedZones.join(", ")}`);
  }
  if (removedZones.length > 0) {
    segments.push(`removed zones: ${removedZones.join(", ")}`);
  }
  if (typeChanged) {
    segments.push("page classification changed");
  }

  return segments.join("; ");
}

export function summarizeMonitorChanges(previousScan, currentScan) {
  if (!previousScan) {
    return {
      scoreDelta: 0,
      changedPages: [],
      newOpportunities: (currentScan.opportunities ?? []).map((item) => item.name).slice(0, 5),
      droppedOpportunities: [],
      summary: ["Initial monitor snapshot created."],
      significant: true
    };
  }

  const previousOpportunities = mapOpportunities(previousScan);
  const currentOpportunities = mapOpportunities(currentScan);
  const newOpportunities = [...currentOpportunities.keys()].filter((name) => !previousOpportunities.has(name));
  const droppedOpportunities = [...previousOpportunities.keys()].filter((name) => !currentOpportunities.has(name));
  const changedPages = summarizePageChanges(mapPages(previousScan), mapPages(currentScan));
  const scoreDelta = currentScan.overallScore - previousScan.overallScore;

  const summary = [];
  if (scoreDelta !== 0) {
    summary.push(`Overall fit moved ${scoreDelta > 0 ? "up" : "down"} by ${Math.abs(scoreDelta)} points.`);
  }
  if (newOpportunities.length > 0) {
    summary.push(`New opportunities detected: ${newOpportunities.slice(0, 3).join(", ")}.`);
  }
  if (droppedOpportunities.length > 0) {
    summary.push(`Opportunity mix dropped: ${droppedOpportunities.slice(0, 3).join(", ")}.`);
  }
  if (changedPages.length > 0) {
    summary.push(`${changedPages.length} page${changedPages.length === 1 ? "" : "s"} changed materially.`);
  }
  if (summary.length === 0) {
    summary.push("No material monitor change since the last refresh.");
  }

  return {
    scoreDelta,
    changedPages,
    newOpportunities,
    droppedOpportunities,
    summary,
    significant: scoreDelta !== 0 || newOpportunities.length > 0 || droppedOpportunities.length > 0 || changedPages.length > 0
  };
}
