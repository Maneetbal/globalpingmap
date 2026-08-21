const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function cors(headers) {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return headers;
}

function response(body, status = 200) {
  const headers = cors(new Headers(JSON_HEADERS));
  return new Response(JSON.stringify(body), { status, headers });
}

function isIPv4(ip) {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIPv6(ip) {
  return ip.includes(":") && /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45;
}

function isPublicIp(ip) {
  if (isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
    const blocked = [
      [0x00000000, 0x00ffffff], [0x0a000000, 0x0affffff], [0x64400000, 0x647fffff],
      [0x7f000000, 0x7fffffff], [0xa9fe0000, 0xa9feffff], [0xac100000, 0xac1fffff],
      [0xc0000000, 0xc00000ff], [0xc0000200, 0xc00002ff], [0xc0a80000, 0xc0a8ffff],
      [0xe0000000, 0xffffffff]
    ];
    return !blocked.some(([a, b]) => n >= a && n <= b);
  }
  if (!isIPv6(ip)) return false;
  const x = ip.toLowerCase();
  return x !== "::" && x !== "::1" && !/^f[cd]|^fe[89ab]|^ff/i.test(x);
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function readAll(directory) {
  return directory.storage.get("entries") || [];
}

async function writeAll(directory, entries) {
  await directory.storage.put("entries", entries);
}

function normalizeEntry(payload) {
  const ip = clean(payload.ip, 64).toLowerCase();
  const rows = Array.isArray(payload.checks) ? payload.checks : [];
  const onlineNodes = rows.filter(row => row && row.online === true).length;
  if (!ip || !isPublicIp(ip)) throw new Error("Only public IPv4/IPv6 addresses are accepted.");
  if (onlineNodes < 1) throw new Error("At least one Check-Host ICMP node must respond.");

  return {
    ip,
    ip_version: isIPv6(ip) ? 6 : 4,
    country_code: clean(payload.country_code, 8).toUpperCase(),
    country_name: clean(payload.country_name),
    region_name: clean(payload.region_name),
    city_name: clean(payload.city_name),
    organization: clean(payload.organization),
    isp: clean(payload.isp || payload.organization),
    usage_type: clean(payload.usage_type) || "Not detected",
    is_proxy: Boolean(payload.is_proxy),
    is_reachable: true,
    ping_nodes: onlineNodes,
    ping_total_nodes: rows.length,
    ping_results: rows.slice(0, 100),
    ping_checked_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    source: "community-check-host"
  };
}

export class PingMapDirectory {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/entries") {
      return Response.json(await readAll(this), { headers: cors(new Headers()) });
    }

    if (request.method !== "POST" || url.pathname !== "/entries") {
      return Response.json({ error: "Not found" }, { status: 404, headers: cors(new Headers()) });
    }

    const payload = await request.json();
    const entry = normalizeEntry(payload);
    const entries = await readAll(this);
    const existing = entries.findIndex(item => String(item.ip).toLowerCase() === entry.ip);

    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.unshift(entry);
    }

    await writeAll(this, entries);
    return Response.json({ status: "added", entry }, { headers: cors(new Headers()) });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(new Headers()) });

    const url = new URL(request.url);

    try {
      if (!env.PINGMAP_DIRECTORY) throw new Error("PINGMAP_DIRECTORY binding is not configured.");

      const id = env.PINGMAP_DIRECTORY.idFromName("global");
      const stub = env.PINGMAP_DIRECTORY.get(id);

      if (request.method === "GET" && url.pathname === "/api/health") {
        return response({ ok: true, service: "pingmap-direct-directory" });
      }

      if (request.method === "GET" && url.pathname === "/api/entries") {
        return new Response(await (await stub.fetch("https://directory/entries")).text(), {
          status: 200,
          headers: cors(new Headers(JSON_HEADERS))
        });
      }

      if (request.method === "POST" && url.pathname === "/api/submit") {
        const payload = await request.json();
        const result = await stub.fetch("https://directory/entries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        return new Response(await result.text(), {
          status: result.status,
          headers: cors(new Headers(JSON_HEADERS))
        });
      }

      return response({ error: "Not found" }, 404);
    } catch (error) {
      return response({ error: error?.message || "Internal server error" }, 400);
    }
  }
};
