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
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIPv6(ip) {
  return ip.includes(":") && /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45;
}

function isPublicIp(ip) {
  if (isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
    const privateRanges = [
      [0x00000000, 0x00ffffff],
      [0x0a000000, 0x0affffff],
      [0x64400000, 0x647fffff],
      [0x7f000000, 0x7fffffff],
      [0xa9fe0000, 0xa9feffff],
      [0xac100000, 0xac1fffff],
      [0xc0000000, 0xc00000ff],
      [0xc0000200, 0xc00002ff],
      [0xc0a80000, 0xc0a8ffff],
      [0xe0000000, 0xffffffff]
    ];
    return !privateRanges.some(([a, b]) => n >= a && n <= b);
  }
  if (!isIPv6(ip)) return false;
  const x = ip.toLowerCase();
  return x !== "::" && x !== "::1" && !/^f[cd]|^fe[89ab]|^ff/i.test(x);
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.PINGMAP_GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "PingMap-Submission-Gateway",
    "Content-Type": "application/json"
  };
}

async function github(env, path, options = {}) {
  if (!env.PINGMAP_GITHUB_TOKEN) throw new Error("PingMap backend is not configured.");
  const repo = env.GITHUB_REPOSITORY || "Maneetbal/globalpingmap";
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: { ...githubHeaders(env), ...(options.headers || {}) }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${data.message || "request failed"}`);
  return data;
}

async function createSubmission(env, payload) {
  const ip = String(payload.ip || "").trim().toLowerCase();
  if (!ip || !isPublicIp(ip)) throw new Error("Only public IPv4/IPv6 addresses are accepted.");

  const title = `IP submission: ${ip}`;
  const body = [
    `IP: ${ip}`,
    "",
    "PingMap browser preview:",
    `Country: ${payload.country_name || ""}`,
    `Country code: ${payload.country_code || ""}`,
    `Region: ${payload.region_name || ""}`,
    `City: ${payload.city_name || ""}`,
    `Organization: ${payload.organization || ""}`,
    `ASN: ${payload.asn || ""}`,
    `Usage type: ${payload.usage_type || ""}`,
    `Proxy/VPN: ${Boolean(payload.is_proxy)}`,
    "",
    "This issue was created by the PingMap submission gateway. GitHub Actions must re-geolocate and verify the IP with Globalping before publishing it."
  ].join("\n");

  const issue = await github(env, "/issues", {
    method: "POST",
    body: JSON.stringify({ title, body })
  });

  return {
    submission_id: issue.number,
    status: "verifying",
    status_url: `/api/submission/${issue.number}`,
    issue_url: issue.html_url
  };
}

async function submissionStatus(env, issueNumber) {
  const issue = await github(env, `/issues/${encodeURIComponent(issueNumber)}`);
  const comments = await github(env, `/issues/${encodeURIComponent(issueNumber)}/comments?per_page=100`);
  const latest = [...comments].reverse().find(c => typeof c.body === "string" && (c.body.includes("**IP added to PingMap.") || c.body.includes("**Submission rejected:")));

  if (!latest) {
    return { status: issue.state === "closed" ? "failed" : "verifying", submission_id: Number(issueNumber), message: issue.state === "closed" ? "Submission ended without a processing result." : "Verifying IP with Globalping…" };
  }

  if (latest.body.includes("**IP added to PingMap.")) {
    return { status: "added", submission_id: Number(issueNumber), message: "IP verified and added to PingMap.", details: latest.body };
  }

  const rejected = latest.body.match(/\*\*Submission rejected:\s*([^*]+)\*\*/i);
  return { status: "rejected", submission_id: Number(issueNumber), message: rejected?.[1]?.trim() || "Submission rejected.", details: latest.body };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(new Headers()) });

    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/submit") {
        const payload = await request.json();
        return response(await createSubmission(env, payload));
      }

      const match = url.pathname.match(/^\/api\/submission\/(\d+)$/);
      if (request.method === "GET" && match) {
        return response(await submissionStatus(env, match[1]));
      }

      if (url.pathname === "/api/health") return response({ ok: true, service: "pingmap-submission-gateway" });
      return response({ error: "Not found" }, 404);
    } catch (error) {
      return response({ error: error?.message || "Internal server error" }, 400);
    }
  }
};
