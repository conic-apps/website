// Deterministic demo-video renderer: headless Chrome + CDP screenshots -> ffmpeg WebM.
// Scenes expose `window.render(p)` (p in 0..1) and are captured at 1280x720.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, cpSync } from "node:fs";
import { readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = 9227;
const W = 1280, H = 720, FPS = 30, DUR = 8;
const FRAMES = Number(process.env.FRAMES || FPS * DUR);
const CHROME = process.env.CHROME ||
  process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const SCENES = join(process.env.SCENES || "assets/media/_scenes");
const OUT = join(process.env.OUT || "assets/media");
const TMP = "/var/folders/kt/0fsh9f7j04d0s2_7c868xd9r0000gn/T/opencode/demo-frames";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sendable(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Number((ws._id = (ws._id || 0) + 1));
    ws._pend = ws._pend || new Map();
    ws._pend.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function openCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws._waiters = [];
    ws.onmessage = async (ev) => {
      let data = ev.data;
      if (typeof data !== "string") data = await data.text();
      const msg = JSON.parse(data);
      if (msg.id) {
        const p = ws._pend && ws._pend.get(msg.id);
        if (!p) return;
        ws._pend.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else if (msg.method) {
        ws._waiters.forEach((w) => w(msg));
      }
    };
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error("ws error " + e.message));
  });
}

async function waitEvent(ws, method) {
  return new Promise((resolve) => {
    const w = (m) => {
      if (m.method === method) {
        ws._waiters.splice(ws._waiters.indexOf(w), 1);
        resolve(m.params);
      }
    };
    ws._waiters.push(w);
  });
}

async function captureScene(ws, scene, frameDir) {
  const url = pathToFileURL(resolve(SCENES, scene + ".html")).href;
  await sendable(ws, "Page.enable");
  await sendable(ws, "Runtime.enable");
  await sendable(ws, "Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = waitEvent(ws, "Page.loadEventFired");
  await sendable(ws, "Page.navigate", { url });
  await loaded;
  for (let tries = 0; tries < 40; tries++) {
    await sleep(200);
    const ok = await sendable(ws, "Runtime.evaluate", { expression: `typeof render==="function"`, returnByValue: true });
    if (ok.result && ok.result.value) break;
    if (tries === 39) console.warn("  WARN: render never appeared on " + scene);
  }
  for (let f = 1; f <= FRAMES; f++) {
    const p = (f - 1) / FRAMES;
    const ev = await sendable(ws, "Runtime.evaluate", { expression: `render(${p}); true`, returnByValue: true });
    if (ev.exceptionDetails) console.warn(`  frame ${f} exc: ${ev.exceptionDetails.text}`);
    const shot = await sendable(ws, "Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(shot.data, "base64");
    writeFileSync(join(frameDir, `f_${String(f).padStart(4, "0")}.png`), buf);
    if (f === 1) console.log(`  frame1 size ${buf.length}`);
    if (f % 60 === 0) console.log(`  ${scene}: ${f}/${FRAMES}`);
  }
}

async function main() {
  const scenes = readdirSync(SCENES).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();
  if (!scenes.length) throw new Error("no scenes in " + SCENES);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const profile = join(TMP, "profile");
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  let ws;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { ws = await openCDP(page.webSocketDebuggerUrl); break; }
    } catch (_) { /* not up yet */ }
    await sleep(250);
  }
  if (!ws) { chrome.kill(); throw new Error("cdp not reachable"); }

  for (const scene of scenes) {
    const frameDir = join(TMP, scene);
    mkdirSync(frameDir, { recursive: true });
    console.log("capturing", scene);
    await captureScene(ws, scene, frameDir);
    const webm = join(OUT, scene + ".webm");
    await new Promise((resolve, reject) => {
      const ff = spawn(FFMPEG, [
        "-y",
        "-framerate", String(FPS),
        "-i", join(frameDir, "f_%04d.png"),
        "-c:v", "libvpx-vp9",
        "-b:v", "0",
        "-crf", "36",
        "-deadline", "good",
        "-cpu-used", "4",
        "-row-mt", "1",
        "-pix_fmt", "yuv420p",
        webm,
      ], { stdio: "ignore" });
      ff.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg exit " + code)));
    });
    cpSync(join(frameDir, "f_0001.png"), join(OUT, scene + "-poster.png"));
    console.log("encoded", basename(webm));
  }

  chrome.kill();
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });