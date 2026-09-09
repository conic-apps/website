// conic-downloads
// Worker bound to dl.conicmc.app. Routes:
//   /latest?os=<os>&arch=<arch>&kind=<kind>  -> 302 redirect to the matching
//                                               mirrored asset (flat, original name)
//   /launcher/<key>                          -> object in "conic-downloads" R2 bucket
//   /nexus/<key>                             -> object in "conic-nexus" R2 bucket
//   /v1/mirror/status                        -> current latest.json
//   /__sync                                  -> on-demand sync (token-protected)
//
// Synchronizes launcher releases from GitHub Releases into R2 on a cron
// schedule (hourly) and on demand via POST /__sync. Every asset of the latest
// release (including signatures, MSI, app bundles and source archives) is
// mirrored flat into the bucket root using its original GitHub file name.
// Assets are SHA-256 verified against GitHub's digest before upload (each file
// retried up to 3 times; still failing files are skipped and recorded in
// warnings). Downloads carry a Digest header for client-side verification.
// Older versions are pruned, keeping only the most recent KEEP_RELEASES.
// Versioned metadata is exposed at /launcher/latest.json.

const LATEST_KEY = "latest.json";
const REDIRECT_TTL = "public, max-age=300, s-maxage=300";

// Attempts per file before it is skipped and recorded in warnings.
const RETRIES = 3;
const RETRY_DELAY_MS = 500;

const CONTENT_TYPES = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".msi": "application/x-msi",
  ".deb": "application/vnd.debian.binary-package",
  ".rpm": "application/x-rpm",
  ".dmg": "application/x-apple-diskimage",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
  ".tar.gz": "application/x-gzip",
  ".sig": "application/pgp-signature",
  ".dll": "application/octet-stream",
  ".so": "application/octet-stream",
  ".dylib": "application/octet-stream",
  "AppImage": "application/octet-stream",
};

function contentTypeFor(key) {
  if (key.endsWith(".AppImage")) return "application/octet-stream";
  if (key.endsWith(".tar.gz")) return CONTENT_TYPES[".tar.gz"];
  const ext = key.slice(key.lastIndexOf("."));
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function sourceNames(tag) {
  return [
    `conic-launcher-${tag}.tar.gz`,
    `conic-launcher-${tag}.zip`,
  ];
}

function digestHex(digest) {
  if (!digest) return null;
  const s = String(digest);
  const i = s.indexOf(":");
  const hex = (i >= 0 ? s.slice(i + 1) : s).trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sha256Base64(hex) {
  let bin = "";
  for (const b of hexToBytes(hex)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectOs(base) {
  if (/\.(exe|msi)$/.test(base)) return "windows";
  if (/\.(deb|rpm|AppImage)$/.test(base)) return "linux";
  if (/\.dmg$/.test(base) || /\.app\.tar\.gz$/.test(base)) return "macos";
  return null;
}

function detectArch(base) {
  if (/[._-]x86_64[._-]/.test(base) || /[._-]amd64[._-]/.test(base) || /[._-]x64[._-]/.test(base)) {
    return "x64";
  }
  if (/[._-]aarch64[._-]/.test(base) || /[._-]arm64[._-]/.test(base)) {
    return "arm64";
  }
  return "";
}

function detectKind(base) {
  if (base.includes("setup") && base.endsWith(".exe")) return "setup";
  if (base.endsWith(".exe")) return "portable";
  if (base.endsWith(".msi")) return "msi";
  if (base.endsWith(".deb")) return "deb";
  if (base.endsWith(".rpm")) return "rpm";
  if (base.endsWith(".AppImage")) return "appimage";
  if (base.endsWith(".dmg")) return "dmg";
  if (base.endsWith(".app.tar.gz")) return "app";
  return "";
}

function classifyAsset(name) {
  const sig = name.endsWith(".sig");
  const base = sig ? name.slice(0, -4) : name;
  const os = detectOs(base);
  if (!os) return null;
  return {
    os,
    arch: detectArch(base),
    kind: sig ? "signature" : detectKind(base),
  };
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

    if (path === "/latest" && (method === "GET" || method === "HEAD")) {
      return latestRedirect(url, env);
    }

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
    let key;
    try {
      key = decodeURIComponent(m[2]);
    } catch (e) {
      key = m[2];
    }

    const obj = await bucket.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = {
      "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeFor(key),
      ETag: `"${obj.httpEtag}"`,
      "Content-Length": String(obj.size),
    };
    const checksum = obj.customMetadata && obj.customMetadata.sha256;
    if (checksum) {
      headers["Digest"] = `sha-256=${sha256Base64(checksum)}`;
      headers["X-Checksum-Sha256"] = checksum;
    }
    headers["Cache-Control"] =
      key === LATEST_KEY
        ? "public, max-age=300, s-maxage=300"
        : "public, max-age=31536000, immutable";

    return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
  },
};

async function latestRedirect(baseUrl, env) {
  const os = baseUrl.searchParams.get("os");
  const arch = baseUrl.searchParams.get("arch");
  const kind = baseUrl.searchParams.get("kind");
  if (!os && !arch && !kind) {
    const res = Response.redirect(new URL("/launcher/latest.json", baseUrl), 302);
    res.headers.set("Cache-Control", REDIRECT_TTL);
    return res;
  }
  const marker = await readMarker(env);
  const files = marker && Array.isArray(marker.files) ? marker.files : [];
  const match = files.find((f) => f.os === os && f.arch === arch && f.kind === kind);
  if (!match) return new Response("Not Found", { status: 404 });

  const loc = new URL(`/launcher/${encodeURIComponent(match.name)}`, baseUrl);
  const res = Response.redirect(loc, 302);
  res.headers.set("Cache-Control", REDIRECT_TTL);
  return res;
}

async function statusResponse(env) {
  const marker = await readMarker(env);
  if (!marker) return Response.json({ empty: true, channel: env.CHANNEL });
  return Response.json(marker);
}

async function readMarker(env) {
  const obj = await env.DOWNLOADS.get(LATEST_KEY);
  if (!obj) return null;
  return obj.json();
}

async function listKeys(bucket) {
  const keys = new Set();
  let cursor;
  do {
    const list = await bucket.list({ limit: 1000, cursor });
    for (const o of list.objects) keys.add(o.key);
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return keys;
}

async function prune(bucket, expected) {
  const keep = (k) => k === LATEST_KEY || k.startsWith("meta/");
  const keys = await listKeys(bucket);
  const doomed = [];
  for (const k of keys) {
    if (!expected.has(k) && !keep(k)) doomed.push(k);
  }
  await mapLimit(doomed, 10, (k) => bucket.delete(k));
}

async function uploadFile(bucket, url, key, dlHeaders, meta, expectHex) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: dlHeaders });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (expectHex) {
        const hex = await sha256Hex(buf);
        if (hex !== expectHex) {
          throw new Error(`sha256 mismatch (want ${expectHex}, got ${hex})`);
        }
      }
      await bucket.put(key, buf, {
        httpMetadata: {
          contentType: res.headers.get("content-type") || contentTypeFor(key),
        },
        customMetadata: meta,
      });
      return null;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return lastErr;
}

async function ensureLatest(bucket, latest, dlHeaders) {
  const existing = await listKeys(bucket);
  const items = [];
  for (const a of latest.assets || []) {
    if (existing.has(a.name)) continue;
    const sha256 = digestHex(a.digest);
    const meta = { source: "github", release: latest.tag_name };
    if (sha256) meta.sha256 = sha256;
    items.push({ url: a.browser_download_url, key: a.name, meta, sha256 });
  }
  for (const n of sourceNames(latest.tag_name)) {
    if (existing.has(n)) continue;
    const url = n.endsWith(".zip") ? latest.zipball_url : latest.tarball_url;
    if (!url) continue;
    items.push({
      url,
      key: n,
      meta: { source: "github", release: latest.tag_name, kind: "source" },
      sha256: null,
    });
  }

  const warnings = [];
  for (const it of items) {
    const err = await uploadFile(bucket, it.url, it.key, dlHeaders, it.meta, it.sha256);
    if (err) warnings.push(`${it.key}: ${err.message}`);
  }
  return warnings;
}

function buildFiles(release) {
  const files = [];
  for (const a of release.assets || []) {
    const c = classifyAsset(a.name) || {};
    files.push({
      name: a.name,
      os: c.os || "unknown",
      arch: c.arch || "",
      kind: c.kind || "other",
      size: a.size,
      sha256: digestHex(a.digest),
      contentType: a.content_type,
    });
  }
  for (const n of sourceNames(release.tag_name)) {
    files.push({
      name: n,
      os: "source",
      arch: "",
      kind: "source",
      size: null,
      sha256: null,
    });
  }
  return files;
}

async function sync(env) {
  const repo = env.GITHUB_REPO;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "conic-downloads",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GH_TOKEN) headers.Authorization = `Bearer ${env.GH_TOKEN}`;

  const keep = parseInt(env.KEEP_RELEASES || "3", 10) || 3;

  let releases = null;
  for (let page = 1; page <= 5 && !releases; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    releases = await res.json();
  }

  const published = (releases || []).filter((r) => !r.draft);
  const recent = published.slice(0, keep);
  const latest = recent[0];
  if (!latest) throw new Error("No matching release found");

  const tag = latest.tag_name;

  const expected = new Set();
  for (const r of recent) {
    for (const a of r.assets || []) expected.add(a.name);
    for (const n of sourceNames(r.tag_name)) expected.add(n);
  }

  const marker = await readMarker(env);
  const bucket = env.DOWNLOADS;
  const dlHeaders = { "User-Agent": "conic-downloads" };

  const warnings = await ensureLatest(bucket, latest, dlHeaders);

  if (marker && marker.tag === tag) {
    await prune(bucket, expected);
    return { status: "skipped", tag, updatedAt: marker.updatedAt, warnings };
  }

  const nextMarker = {
    status: "synced",
    channel: env.CHANNEL,
    tag,
    updatedAt: new Date().toISOString(),
    publishedAt: latest.published_at,
    releaseUrl: latest.html_url,
    files: buildFiles(latest),
    warnings,
  };
  await bucket.put(LATEST_KEY, JSON.stringify(nextMarker), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { source: "github", release: tag },
  });

  await prune(bucket, expected);

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