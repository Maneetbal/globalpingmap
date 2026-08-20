const RATE_LIMIT = new Map();
const RATE_WINDOW_MS = 30_000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const isIPv4 = (ip) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip);
const isIPv6 = (ip) => ip.includes(":") && /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45;

function ipv4PrivateOrReserved(ip) {
  const p = ip.split(".").map(Number);
  const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
  const ranges = [
    [0x00000000, 0x00ffffff], [0x0a000000, 0x0affffff], [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff], [0xa9fe0000, 0xa9feffff], [0xac100000, 0xac1fffff],
    [0xc0000000, 0xc00000ff], [0xc0000200, 0xc00002ff], [0xc0a80000, 0xc0a8ffff],
    [0xc6120000, 0xc613ffff], [0xc6336400, 0xc63364ff], [0xcb007100, 0xcb0071ff],
    [0xe0000000, 0xffffffff]
  ];
  return ranges.some(([a, b]) => n >= a && n <= b);
}

function publicIp(ip) {
  if (isIPv4(ip)) return !ipv4PrivateOrReserved(ip);
  if (isIPv6(ip)) {
    const compact = ip.toLowerCase();
    if (compact === "::1" || compact === "::") return false;
    if (compact.startsWith("fc") || compact.startsWith("fd") || compact.startsWith("fe8") || compact.startsWith("fe9") || compact.startsWith("fea") || compact.startsWith("feb")) return false;
    if (compact.startsWith("ff")) return false;
    return true;
  }
  return false;
}

function rateLimited(clientIp) {
  const now = Date.now();
  const previous = RATE_LIMIT.get(clientIp) || 0;
  if (now - previous < RATE_WINDOW_MS) return true;
  RATE_LIMIT.set(clientIp, now);
  return false;
}

async function geolocate(ip) {
  const url = `https://api.ip2location.io/?ip=${encodeURIComponent(ip)}&format=json`;
  const response = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error(`IP2Location returned HTTP ${response.status}`);
  const data = await response.json();
  if (!data || !data.country_code || !data.city_name) throw new Error("IP2Location could not determine a location");
  return data;
}

async function pingWithGlobalping(ip) {
  const createResponse = await fetch("https://api.globalping.io/v1/measurements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: ip,
      type: "ping",
      locations: [{ limit: 1 }],
      measurementOptions: { packets: 3, ipVersion: isIPv6(ip) ? 6 : 4 }
    })
  });
  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Globalping create failed (${createResponse.status}): ${text.slice(0, 180)}`);
  }
  const created = await createResponse.json();
  const id = created?.id;
  if (!id) throw new Error("Globalping did not return a measurement ID");

  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 900));
    const resultResponse = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(id)}`);
    if (!resultResponse.ok) continue;
    const result = await resultResponse.json();
    if (result.status === "in-progress") continue;
    const measurements = Array.isArray(result.results) ? result.results : [];
    const stats = measurements.map(item => item?.result?.stats).filter(Boolean);
    const responsive = stats.find(s => Number(s.rcv || 0) > 0 || Number(s.loss) < 100);
    if (responsive) return { reachable: true, loss: Number(responsive.loss ?? 0), avgMs: Number(responsive.avg ?? 0), measurementId: id };
    return { reachable: false, loss: 100, avgMs: null, measurementId: id };
  }
  throw new Error("Globalping measurement timed out");
}

async function dbRequired(env) {
  if (!env.DB) throw new Error("D1 database is not connected yet");
  return env.DB;
}

async function previewIp(request) {
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(`preview:${clientIp}`)) return json({ error: "Please wait before requesting another geolocation preview." }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const ip = String(body?.ip || "").trim().toLowerCase();
  if (!publicIp(ip)) return json({ error: "Only public IPv4/IPv6 addresses can be previewed." }, 400);
  const geo = await geolocate(ip);
  return json({ ok: true, ip, geo: {
    country_code: geo.country_code || "",
    country_name: geo.country_name || "",
    region_name: geo.region_name || "",
    city_name: geo.city_name || "",
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    zip_code: geo.zip_code || "",
    time_zone: geo.time_zone || "",
    asn: geo.asn ? String(geo.asn) : "",
    as_name: geo.as || "",
    isp: geo.isp || geo.as || "",
    domain: geo.domain || "",
    usage_type: geo.usage_type || "",
    is_proxy: geo.is_proxy ? 1 : 0
  }});
}

async function submitIp(request, env) {
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(`submit:${clientIp}`)) return json({ error: "Please wait before submitting another IP." }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const ip = String(body?.ip || "").trim().toLowerCase();
  if (!publicIp(ip)) return json({ error: "Only public IPv4/IPv6 addresses can be submitted." }, 400);

  const db = await dbRequired(env);
  const duplicate = await db.prepare("SELECT id, ip FROM ip_entries WHERE ip = ? LIMIT 1").bind(ip).first();
  if (duplicate) return json({ error: "That IP is already in PingMap.", entry: duplicate }, 409);

  const ping = await pingWithGlobalping(ip);
  if (!ping.reachable) return json({ error: "The IP did not answer the ICMP reachability check, so it was not added.", ping }, 422);

  const now = new Date().toISOString();
  const clean = (value) => String(value ?? "").trim().slice(0, 300);
  const entry = {
    ip,
    ip_version: isIPv6(ip) ? 6 : 4,
    country_code: clean(body?.country_code).toUpperCase().slice(0, 2),
    country_name: clean(body?.country_name),
    region_name: clean(body?.region_name),
    city_name: clean(body?.city_name),
    latitude: Number.isFinite(Number(body?.latitude)) ? Number(body.latitude) : null,
    longitude: Number.isFinite(Number(body?.longitude)) ? Number(body.longitude) : null,
    zip_code: clean(body?.zip_code),
    time_zone: clean(body?.time_zone),
    asn: clean(body?.asn).replace(/^AS/i, "").slice(0, 20),
    as_name: clean(body?.as_name),
    isp: clean(body?.isp),
    domain: clean(body?.domain),
    usage_type: clean(body?.usage_type),
    is_proxy: body?.is_proxy ? 1 : 0,
    is_reachable: 1,
    ping_avg_ms: ping.avgMs,
    ping_loss: ping.loss,
    ping_checked_at: now,
    submitted_at: now,
    source: "community"
  };

  if (!entry.country_code || !entry.country_name) return json({ error: "Country is required." }, 400);

  await db.prepare(`
    INSERT INTO ip_entries (
      ip, ip_version, country_code, country_name, region_name, city_name,
      latitude, longitude, zip_code, time_zone, asn, as_name, isp, domain,
      usage_type, is_proxy, is_reachable, ping_avg_ms, ping_loss,
      ping_checked_at, submitted_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.ip, entry.ip_version, entry.country_code, entry.country_name,
    entry.region_name, entry.city_name, entry.latitude, entry.longitude,
    entry.zip_code, entry.time_zone, entry.asn, entry.as_name, entry.isp,
    entry.domain, entry.usage_type, entry.is_proxy, entry.is_reachable,
    entry.ping_avg_ms, entry.ping_loss, entry.ping_checked_at,
    entry.submitted_at, entry.source
  ).run();

  return json({ ok: true, entry, ping });
}

async function searchIps(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const country = url.searchParams.get("country")?.trim() || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  const db = await dbRequired(env);
  let sql = `SELECT * FROM ip_entries WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ` AND (ip LIKE ? OR country_name LIKE ? OR country_code LIKE ? OR region_name LIKE ? OR city_name LIKE ? OR isp LIKE ? OR as_name LIKE ? OR asn LIKE ? OR domain LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }
  if (country) { sql += ` AND country_code = ?`; params.push(country); }
  sql += ` ORDER BY submitted_at DESC LIMIT ?`; params.push(limit);
  const { results } = await db.prepare(sql).bind(...params).all();
  return json({ results, count: results.length });
}

async function countries(env) {
  const db = await dbRequired(env);
  const { results } = await db.prepare(`SELECT country_code, country_name, COUNT(*) AS entries FROM ip_entries WHERE country_code IS NOT NULL GROUP BY country_code, country_name ORDER BY country_name ASC`).all();
  return json({ results });
}

async function stats(env) {
  const db = await dbRequired(env);
  const row = await db.prepare(`SELECT COUNT(*) AS ips, COUNT(DISTINCT country_code) AS countries, COUNT(DISTINCT country_code || ':' || city_name) AS cities FROM ip_entries`).first();
  return json(row || { ips: 0, countries: 0, cities: 0 });
}

async function api(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, database: Boolean(env.DB), geolocation: "IP2Location.io", reachability: "Globalping" });
    if (url.pathname === "/api/my-ip" && request.method === "GET") return json({ ip: request.headers.get("CF-Connecting-IP") || null });
    if (url.pathname === "/api/preview" && request.method === "POST") return await previewIp(request);
    if (url.pathname === "/api/search" && request.method === "GET") return await searchIps(request, env);
    if (url.pathname === "/api/countries" && request.method === "GET") return await countries(env);
    if (url.pathname === "/api/stats" && request.method === "GET") return await stats(env);
    if (url.pathname === "/api/submit" && request.method === "POST") return await submitIp(request, env);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return json({ error: message }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    return env.ASSETS.fetch(request);
  }
};
