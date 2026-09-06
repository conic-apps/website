// conic-downloads
// Worker bound to dl.conicmc.app. Routes:
//   /nexus/<key>     -> public object in the "conic-nexus" R2 bucket
//   /launcher/<key>  -> mirrored asset in the "conic-downloads" R2 bucket
// Synchronizes the latest launcher release from GitHub Releases into R2 on a
// cron schedule (hourly) and on demand via POST /__sync.

// Copy of the download section of the website. Each key is relative to the
// DOWNLOADS bucket root and maps to a GitHub release asset by name pattern.
const FILE_MAP = [
  { key: "windows/x64/installer.exe", re: /_x64-setup\.exe$/ },
  { key: "windows/x64/single.exe", re: /_x64\.exe$/ },
  { key: "windows/arm64/installer.exe", re: /_arm64-setup\.exe$/ },
  { key: "windows/arm64/single.exe", re: /_arm64\.exe$/ },
  { key: "linux/x64.deb", re: /_amd64\.deb$/ },
  { key: "linux/arm64.deb", re: /_arm64\.deb$/ },
  { key: "linux/x64.rpm", re: /x86_64\.rpm$/ },
  { key: "linux/arm64.rpm", re: /aarch64\.rpm$/ },
  { key: "linux/x64.AppImage", re: /_amd64\.AppImage$/ },
  { key: "linux/arm64.AppImage", re: /_aarch64\.AppImage$/ },
  { key: "macos/x64.dmg", re: /_x64\.dmg$/ },
  { key: "macos/arm64.dmg", re: /_aarch64\.dmg$/ },
];

const CONTENT_TYPES = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".deb": "application/vnd.debian.binary-package",
  ".rpm": "application/x-rpm",
  ".dmg": "application/x-apple-diskimage",
  ".json": "application/json; charset=utf-8",
  ".dll": "application/octet-stream",
  ".so": "application/octet-stream",
  ".dylib": "application/octet-stream",
  "AppImage": "application/octet-stream",
};

function contentTypeFor(key) {
  if (key.endsWith(".AppImage")) return "application/octet-stream";
  const ext = key.slice(key.lastIndexOf("."));
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export default {
  async scheduled(event, env, ctx) {
    await sync(env).catch((e) => {
      console.error("sync failed:", e);
    });
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (path === "/v1/mirror/status") {
      return statusResponse(env);
    }

    if (path === "/__sync") {
      if (method !== "POST" && method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const secret = env.SYNC_TOKEN;
      if (secret) {
        const given =
          request.headers.get("X-Sync-Token") || url.searchParams.get("token");
        if (given !== secret) return new Response("Forbidden", { status: 403 });
      }
      const run = sync(env);
      ctx.waitUntil(
        run.then(
          (r) => console.log("sync complete", JSON.stringify(r)),
          (e) => console.error("sync failed", e && e.stack ? e.stack : e)
        )
      );
      return Response.json({ status: "started" });
    }

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const m = path.match(/^\/(nexus|launcher)\/(.+)$/);
    if (!m) return new Response("Not Found", { status: 404 });

    const bucket = m[1] === "nexus" ? env.NEXUS : env.DOWNLOADS;
    const key = m[2];

    const obj = await bucket.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = {
      "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeFor(key),
      ETag: `"${obj.httpEtag}"`,
      "Content-Length": String(obj.size),
    };
    if (key.startsWith("latest/") || key === "meta/latest.json") {
      headers["Cache-Control"] = "public, max-age=300, s-maxage=300";
    } else {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }

    return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
  },
};

async function statusResponse(env) {
  const marker = await readMarker(env);
  if (!marker) return Response.json({ empty: true, channel: env.CHANNEL });
  return Response.json(marker);
}

async function readMarker(env) {
  const obj = await env.DOWNLOADS.get("meta/latest.json");
  if (!obj) return null;
  return obj.json();
}

async function sync(env) {
  const repo = env.GITHUB_REPO;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "conic-downloads",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GH_TOKEN) headers.Authorization = `Bearer ${env.GH_TOKEN}`;

  let release = null;
  let page = 1;
  while (page <= 5 && !release) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    const releases = await res.json();
    for (const r of releases) {
      if (!r.draft) {
        release = r;
        break;
      }
    }
    page += 1;
    if (releases.length < 1) break;
  }
  if (!release) throw new Error("No matching release found");

  const tag = release.tag_name;
  const marker = await readMarker(env);
  if (marker && marker.tag === tag) {
    return { status: "skipped", tag, updatedAt: marker.updatedAt };
  }

  const assets = release.assets || [];
  const complete = [];
  const warnings = [];

  const dlHeaders = { "User-Agent": "conic-downloads" };
  await mapLimit(FILE_MAP, 3, async (entry) => {
    const asset = assets.find((a) => entry.re.test(a.name));
    if (!asset) {
      warnings.push(entry.key);
      return;
    }
    const res = await fetch(asset.browser_download_url, { headers: dlHeaders });
    if (!res.ok || !res.body) {
      throw new Error(`Download failed for ${entry.key}: ${res.status}`);
    }
    await env.DOWNLOADS.put(`latest/${entry.key}`, res.body, {
      httpMetadata: { contentType: contentTypeFor(entry.key) },
      customMetadata: { source: "github", release: tag },
    });
    complete.push(entry.key);
  });

  const nextMarker = {
    status: "synced",
    channel: env.CHANNEL,
    tag,
    updatedAt: new Date().toISOString(),
    releaseUrl: release.html_url,
    files: complete,
    warnings,
  };
  await env.DOWNLOADS.put("meta/latest.json", JSON.stringify(nextMarker), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return nextMarker;
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results.push(await fn(items[idx]));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}