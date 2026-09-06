/* ==========================================================================
   Conic Launcher — website behavior
   Minimal platform JS: reveal, counters, terminal typing, conic geometry,
   navigation, clock, theme.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion) document.body.classList.add("no-anim");

  /* ------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------ */
  var storageKey = "conic-site-theme";
  var root = document.documentElement;
  var themeBtn = document.querySelector("[data-theme-toggle]");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (themeBtn) {
      themeBtn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      );
      themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
    }
  }

  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch (e) {}
  applyTheme(savedTheme === "light" ? "light" : "dark");

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch (e) {}
    });
  }

  /* ------------------------------------------------------------------
     Mobile navigation
     ------------------------------------------------------------------ */
  var toggle = document.querySelector(".nav-toggle");
  var navLinks = document.getElementById("nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ------------------------------------------------------------------
     Conic-section hyperbolas — reproduces the WindowBackground geometry:
     six curves sharing one origin, b = 200, a = [40,110,180,280,420,640],
     four branches each, rotated -40deg. Colored inner->outer:
     lavender, blue, sky, teal, green, yellow, fading per curve.
     ------------------------------------------------------------------ */
  function buildConics() {
    var groups = document.querySelectorAll(".backdrop-hyperbolas .conic");
    if (!groups.length) return;

    var CURVES = [
      { a: 40, cls: "conic-1" },
      { a: 110, cls: "conic-2" },
      { a: 180, cls: "conic-3" },
      { a: 280, cls: "conic-4" },
      { a: 420, cls: "conic-5" },
      { a: 640, cls: "conic-6" },
    ];
    var B = 200;
    var RANGE = 640;
    var STEP = 8;
    var CXR = 600,
      CYR = 200; // origin in SVG units
    var ROT = (-40 * Math.PI) / 180; // rotation, as in WindowBackground
    var SVG = "http://www.w3.org/2000/svg";

    groups.forEach(function (g, idx) {
      var a = CURVES[idx].a;
      g.classList.add(CURVES[idx].cls);
      g.style.opacity = (0.45 - idx * 0.055).toFixed(3);

      // four branches; build each as a polyline from parametric sampling
      [1, -1].forEach(function (sx) {
        [1, -1].forEach(function (sy) {
          var d = "";
          var first = true;
          for (var x = a; x <= RANGE; x += STEP) {
            var y = B * Math.sqrt((x * x) / (a * a) - 1);
            if (!isFinite(y)) continue;
            // un-rotated coordinate
            var ux = sx * x;
            var uy = sy * y;
            // rotate by ROT about origin
            var px = ux * Math.cos(ROT) - uy * Math.sin(ROT);
            var py = ux * Math.sin(ROT) + uy * Math.cos(ROT);
            var X = CXR + px;
            var Y = CYR - py; // SVG y down
            d += (first ? "M" : "L") + X.toFixed(1) + " " + Y.toFixed(1) + " ";
            first = false;
          }
          if (d) {
            var path = document.createElementNS(SVG, "path");
            path.setAttribute("d", d.trim());
            g.appendChild(path);
          }
        });
      });
    });
  }

  /* ------------------------------------------------------------------
     Launcher replica (hero) — sky, voxel world, beat bars, scaling.
     Geometry mirrors WindowBackground.vue (hyperbolas at 25% height;
     voxel terrain with trees), painted as a quiet silhouette layer.
     ------------------------------------------------------------------ */
  var SVG_NS = "http://www.w3.org/2000/svg";

  /** Hyperbola path (4 branches, rotated) as in the launcher background. */
  function hyperbolaPath(a, B) {
    var RANGE = 640,
      STEP = 8;
    var CXR = 500,
      CYR = 140;
    var ROT = (-40 * Math.PI) / 180;
    var d = "";
    [1, -1].forEach(function (sx) {
      [1, -1].forEach(function (sy) {
        var acc = "";
        var first = true;
        for (var x = a; x <= RANGE; x += STEP) {
          var y = B * Math.sqrt((x * x) / (a * a) - 1);
          if (!isFinite(y)) continue;
          var px = sx * x * Math.cos(ROT) - sy * y * Math.sin(ROT);
          var py = sx * x * Math.sin(ROT) + sy * y * Math.cos(ROT);
          acc +=
            (first ? "M" : "L") +
            (CXR + px).toFixed(1) +
            " " +
            (CYR - py).toFixed(1) +
            " ";
          first = false;
        }
        if (acc) d += acc;
      });
    });
    return d;
  }

  /** Deterministic LCG so the replica looks identical on every load. */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Loose isometric voxel terrain with the occasional tree. */
  function buildWindowWorld() {
    var g = document.querySelector(".lz-world-terrain");
    if (!g) return;
    var rng = makeRng(20260906);
    var W = 1000,
      H = 420;
    var horizon = 150,
      floor = H;
    var rows = [];
    var c;

    var colKey = {};
    for (var row = 0; row < 9; row++) {
      var d = row / 8;
      var yBase = horizon + (floor - horizon) * Math.pow(1 - d, 1.5);
      var size = 88 * Math.pow(1 - d, 1.25) + 6;
      var alpha = 0.16 + 0.7 * (1 - d); // nearer = more filled
      var strokeW = 1;
      var nCols = Math.ceil(W / (size * 1.4)) + 2;
      rows.push({ d: d, y: yBase, s: size, a: alpha, sw: strokeW, n: nCols });
    }

    function diamond(cx, cy, s, a) {
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute(
        "d",
        "M" +
          cx.toFixed(1) +
          " " +
          (cy - s / 2).toFixed(1) +
          " L" +
          (cx + s).toFixed(1) +
          " " +
          cy.toFixed(1) +
          " L" +
          cx.toFixed(1) +
          " " +
          (cy + s / 2).toFixed(1) +
          " L" +
          (cx - s).toFixed(1) +
          " " +
          cy.toFixed(1) +
          " Z",
      );
      p.setAttribute("fill", "#ffffff");
      p.setAttribute("fill-opacity", String(a));
      p.setAttribute("stroke", "none");
      return p;
    }

    function sideFace(cx, cy, s, half, a) {
      // left face (facing camera-left) — subtle
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute(
        "d",
        "M" +
          (cx - s).toFixed(1) +
          " " +
          cy.toFixed(1) +
          " L" +
          cx.toFixed(1) +
          " " +
          (cy + s / 2).toFixed(1) +
          " L" +
          cx.toFixed(1) +
          " " +
          (cy + s / 2 + half).toFixed(1) +
          " L" +
          (cx - s).toFixed(1) +
          " " +
          (cy + half).toFixed(1) +
          " Z",
      );
      p.setAttribute("fill", "#ffffff");
      p.setAttribute("fill-opacity", String(a * 0.5));
      p.setAttribute("stroke", "none");
      return p;
    }

    function tree(cx, baseY, s, a) {
      var trunk = document.createElementNS(SVG_NS, "rect");
      trunk.setAttribute("x", String(cx - s * 0.09));
      trunk.setAttribute("y", String(baseY - s * 1.5));
      trunk.setAttribute("width", String(s * 0.18));
      trunk.setAttribute("height", String(s * 1.5));
      trunk.setAttribute("fill", "#ffffff");
      trunk.setAttribute("fill-opacity", String(a));
      g.appendChild(trunk);
      for (var t = 0; t < 4; t++) {
        var tw = s * (1.5 - t * 0.28);
        g.appendChild(diamond(cx, baseY - s * 1.6 - t * s * 0.52, tw, a));
      }
    }

    for (var r = 0; r < rows.length; r++) {
      var rowD = rows[r];
      var startX = r % 2 ? -rowD.s : rowD.s * 0.5;
      var groundY = rowD.y - rowD.s * 0.5;
      // fill the near two rows with denser cubes to read as "terrain"
      var isGround = r >= rows.length - 2;
      var step = rowD.s * 1.35;
      if (isGround) step = rowD.s * 0.85; // tighter = solid floor
      for (var kx = 0; kx < rowD.n; kx++) {
        var cx = startX + kx * step;
        if (cx < -rowD.s * 2 || cx > W + rowD.s * 2) continue;
        var rr = rng();
        g.appendChild(
          diamond(cx, groundY, rowD.s, isGround ? rowD.a * 0.55 : rowD.a * 0.3),
        );
        g.appendChild(
          sideFace(
            cx,
            groundY,
            rowD.s,
            rowD.s * 0.55,
            isGround ? rowD.a * 0.7 : rowD.a * 0.35,
          ),
        );
        if (rr < 0.06 - rowD.d * 0.05 && !isGround && cx > 0 && cx < W) {
          tree(cx, groundY, rowD.s * 1.05, rowD.a * 0.5);
        }
      }
    }

    // faint ground fog / floor band at the very bottom
    var fog = document.createElementNS(SVG_NS, "rect");
    fog.setAttribute("x", "0");
    fog.setAttribute("y", String(floor - 8));
    fog.setAttribute("width", String(W));
    fog.setAttribute("height", String(24));
    fog.setAttribute("fill", "#ffffff");
    fog.setAttribute("fill-opacity", "0.35");
    g.appendChild(fog);
  }

  /** Build + animate the footer audio visualizer bars. */
  function buildBeatBars() {
    var beat = document.querySelector(".lz-beat");
    if (!beat) return;
    var bars = [];
    var N = 44;
    var container = beat.getBoundingClientRect ? beat : null;
    var base = {};
    for (var i = 0; i < N; i++) {
      var b = document.createElement("i");
      beat.appendChild(b);
      bars.push({ el: b, v: 3 + Math.abs(Math.sin(i * 1.7)) * 16, target: 3 });
    }
    if (reduceMotion) return; // static idle bars

    // smooth pseudo-spectrum wander
    function drive(t) {
      for (var i = 0; i < bars.length; i++) {
        var k = (i + 2) * 0.11 + t * 0.00016;
        var v =
          (Math.sin(k * 1.0) + Math.sin(k * 2.7 + 1.3) * 0.6 + 1.6) * 5 + 3;
        bars[i].target = Math.max(2, v);
        bars[i].v += (bars[i].target - bars[i].v) * 0.16;
        bars[i].el.style.transform =
          "scaleY(" + (0.1 + bars[i].v / 26).toFixed(3) + ")";
      }
      requestAnimationFrame(drive);
    }
    requestAnimationFrame(drive);
  }

  /** Scale the fixed-design launcher replica to its container width. */
  function scaleLauncher() {
    var card = document.querySelector(".hero-card");
    var win = document.querySelector(".launcher-window");
    if (!card || !win) return;
    var avail = card.clientWidth;
    var ls = Math.min(1, avail / 1000);
    card.style.setProperty("--ls", String(ls));
  }

  /** Pause videos that scroll out of view; honour reduced motion. */
  function initVideos() {
    var vids = document.querySelectorAll(".demo-media video");
    if (!vids.length) return;
    if (reduceMotion) {
      vids.forEach(function (v) {
        v.autoplay = false;
        v.setAttribute("preload", "metadata");
        v.pause();
      });
      return;
    }
    var vp = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) {
            var p = v.play();
            if (p) p.catch(function () {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: 0.25 },
    );
    vids.forEach(function (v) {
      vp.observe(v);
    });
  }

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */ /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  var io;
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("in");
      });
      return;
    }
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Animated counters
     ------------------------------------------------------------------ */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    if (reduceMotion) {
      el.textContent = decimals ? target.toFixed(decimals) : Math.round(target);
      return;
    }
    var duration = 1400;
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = decimals ? val.toFixed(decimals) : Math.round(val);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initCounters() {
    var counters = document.querySelectorAll(".metric-num[data-count]");
    if (!("IntersectionObserver" in window)) {
      counters.forEach(animateCount);
      return;
    }
    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            animateCount(e.target);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    counters.forEach(function (el) {
      cio.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Clock (footer, technical)
     ------------------------------------------------------------------ */
  function startClock() {
    var el = document.getElementById("clock");
    if (!el) return;
    function tick() {
      var d = new Date();
      var p = function (n) {
        return String(n).padStart(2, "0");
      };
      el.textContent =
        p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  function init() {
    buildConics();
    buildWindowSky();
    buildWindowWorld();
    buildBeatBars();
    scaleLauncher();
    initVideos();
    initReveal();
    initCounters();
    startClock();

    var rsz;
    window.addEventListener("resize", function () {
      clearTimeout(rsz);
      rsz = setTimeout(scaleLauncher, 120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
