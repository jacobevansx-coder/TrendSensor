import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { allowPrivateTargets, isBlockedHostname, isBlockedIp } from "./host-policy.js";

const USER_AGENT =
  "TrendSensor/0.1 (+https://local.trendsensor.audit; monetization-audit bot for owned and permitted sites)";

const MAX_REDIRECTS = 5;
const HTML_CONTENT_TYPE = /text\/html|application\/xhtml\+xml/i;

async function readText(stream, maxBytes) {
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error(`Response exceeded ${maxBytes} bytes; cap the source or sample fewer items.`);
    }
    text += decoder.decode(chunk, { stream: true });
  }

  text += decoder.decode();
  return text;
}

// Runtime SSRF guard. Validates scheme, the literal/hostname, and — for DNS names — every resolved
// address. Returns the address the connection must be PINNED to (or null when running in the
// allow-private/local mode, where the caller connects with default DNS). Called for the initial URL
// and again for every redirect target, so a public page that 30x-redirects to an internal address is
// blocked at the hop. `lookup` is injectable for tests; defaults to dns.lookup.
export async function assertUrlAllowed(rawUrl, lookup = dns.lookup) {
  const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error(`Blocked non-http(s) target: ${url.protocol}//${url.hostname}`);
  }

  if (allowPrivateTargets()) {
    return null; // local/owned mode: no validation, no pinning
  }

  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (isBlockedHostname(url.hostname)) {
    throw new Error(`Blocked private or loopback host: ${host}`);
  }

  if (net.isIP(host)) {
    return host; // validated literal — pin the connection to it
  }

  let resolved;
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }

  const addresses = (Array.isArray(resolved) ? resolved : [resolved]).map((entry) =>
    typeof entry === "string" ? entry : entry.address
  );
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(`Blocked private or loopback host: ${host} resolves to ${address}`);
    }
  }

  // Pin to a validated address. The connection then cannot re-resolve to a different (private)
  // target between this check and connect time — this is what closes the DNS-rebinding window.
  return addresses[0];
}

// A dns.lookup-compatible function that always returns the single pre-validated address, ignoring the
// hostname. Passed to http(s).request so the socket connects to exactly the IP we checked. The request
// still carries the real Host header and TLS servername, so vhost routing and cert validation are
// unaffected — only the destination IP is pinned.
export function buildLookup(pinnedAddress) {
  if (!pinnedAddress) {
    return undefined;
  }

  const family = net.isIP(pinnedAddress);
  return (hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const wantsAll = typeof options === "object" && options !== null && options.all;
    if (wantsAll) {
      cb(null, [{ address: pinnedAddress, family }]);
    } else {
      cb(null, pinnedAddress, family);
    }
  };
}

function requestOnce(url, { signal, pinnedAddress, accept }) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const options = {
      method: "GET",
      signal,
      lookup: buildLookup(pinnedAddress),
      headers: {
        "user-agent": USER_AGENT,
        accept
      }
    };
    if (isHttps) {
      options.servername = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
    }

    const request = transport.request(url, options, resolve);
    request.on("error", reject);
    request.end();
  });
}

export async function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const lookup = options.lookup ?? dns.lookup;
  const accept = options.accept ?? "text/html,application/xhtml+xml";
  const contentTypePattern = options.contentTypePattern ?? HTML_CONTENT_TYPE;
  // One timeout for the whole chain so redirect loops can't amplify wall-clock time.
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);

  let currentUrl = new URL(url);

  for (let redirects = 0; ; redirects += 1) {
    const pinnedAddress = await assertUrlAllowed(currentUrl, lookup);
    const response = await requestOnce(currentUrl, { signal, pinnedAddress, accept });
    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (status >= 300 && status < 400 && location) {
      response.resume(); // drain and release the socket
      if (redirects >= maxRedirects) {
        throw new Error(`Too many redirects (> ${maxRedirects}) starting from ${url}.`);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`Fetch failed with HTTP ${status}`);
    }

    const contentType = response.headers["content-type"] ?? "";
    if (!contentTypePattern.test(contentType)) {
      response.resume();
      throw new Error(`Unexpected content type: ${contentType || "unknown content type"}`);
    }

    return {
      text: await readText(response, maxBytes),
      status,
      finalUrl: currentUrl.toString(),
      contentType
    };
  }
}

export async function fetchPage(url, options = {}) {
  const page = await fetchText(url, {
    ...options,
    accept: "text/html,application/xhtml+xml",
    contentTypePattern: HTML_CONTENT_TYPE
  });

  return {
    html: page.text,
    status: page.status,
    finalUrl: page.finalUrl
  };
}
