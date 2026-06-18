import net from "node:net";

export const ALLOW_PRIVATE_TARGETS_FLAG = "TREND_SENSOR_ALLOW_PRIVATE_TARGETS";
// Back-compat alias for the flag this project shipped earlier.
const LEGACY_FLAG = "TREND_SENSOR_ALLOW_PRIVATE_HOSTS";

// Reserved / non-public IP ranges that must never be fetched from a public deployment (SSRF guard).
// net.BlockList canonicalises addresses internally, so this handles odd-but-valid forms such as
// 0:0:0:0:0:0:0:1 and compressed IPv6 without any hand-rolled prefix matching.
const blocked = new net.BlockList();

// IPv4
blocked.addSubnet("0.0.0.0", 8, "ipv4"); // current/unspecified host
blocked.addSubnet("10.0.0.0", 8, "ipv4"); // private
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
blocked.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local (incl. 169.254.169.254 cloud metadata)
blocked.addSubnet("172.16.0.0", 12, "ipv4"); // private
blocked.addSubnet("192.168.0.0", 16, "ipv4"); // private
blocked.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blocked.addSubnet("240.0.0.0", 4, "ipv4"); // reserved (incl. 255.255.255.255 broadcast)

// IPv6 — note net.BlockList maps IPv4-mapped addresses (::ffff:a.b.c.d, in either dotted or hex form)
// against the IPv4 rules above, so a v4-mapped private address is caught automatically and we must NOT
// add a blanket ::ffff:0:0/96 rule (it would match every IPv4 address).
blocked.addAddress("::", "ipv6"); // unspecified
blocked.addAddress("::1", "ipv6"); // loopback
blocked.addSubnet("fc00::", 7, "ipv6"); // unique-local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local
blocked.addSubnet("ff00::", 8, "ipv6"); // multicast

export function allowPrivateTargets(env = process.env) {
  const value = env[ALLOW_PRIVATE_TARGETS_FLAG] ?? env[LEGACY_FLAG] ?? "";
  return /^(1|true|yes|on)$/i.test(value);
}

// Classify a literal IP (v4 or v6). Fails closed: anything that isn't a parseable IP is treated as blocked.
export function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 0) {
    return true;
  }
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

// String-level check used at request-parse time (synchronous, no DNS). Blocks obvious local hostnames
// and any literal IP in a reserved range. Real DNS names return false here and are re-validated against
// their resolved addresses at fetch time (see fetcher.assertUrlAllowed).
export function isBlockedHostname(hostname) {
  const host = String(hostname ?? "")
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (!host) {
    return true;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  ) {
    return true;
  }
  if (net.isIP(host)) {
    return isBlockedIp(host);
  }
  return false;
}
