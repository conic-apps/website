/* ==========================================================================
   Conic Launcher — website behavior
   Minimal platform JS: reveal, counters, terminal typing, conic geometry,
   navigation, clock, theme.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      themeBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
      themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
    }
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(storageKey); } catch (e) {}
  applyTheme(savedTheme === "light" ? "light" : "dark");

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem(storageKey, next); } catch (e) {}
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
    var CXR = 600, CYR = 200;         // origin in SVG units
    var ROT = (-40 * Math.PI) / 180;  // rotation, as in WindowBackground
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
     Terminal typing
     ------------------------------------------------------------------ */
  var TERM_LINES = [
    [
      { t: "$ ", c: "k" },
      { t: "conic launch " },
      { t: "--instance fabric-1.21", c: "vs" },
    ],
    [
      { t: "\u2714 ", c: "ok" },
      { t: "java runtime resolved" },
      { t: "    17.0.11  (auto)", c: "dim" },
    ],
    [
      { t: "\u2714 ", c: "ok" },
      { t: "memory auto-allocated" },
      { t: "    max 4096 MB / 32-bit cap", c: "dim" },
    ],
    [
      { t: "\u2714 ", c: "ok" },
      { t: "loader resolved" },
      { t: "          Fabric 0.16.9 + MC 1.21", c: "dim" },
    ],
    [
      { t: "\u2714 ", c: "ok" },
      { t: "assets verified" },
      { t: "         647 / 647", c: "dim" },
    ],
  ];

  function makeLineEl(line) {
    var el = document.createElement("div");
    line.forEach(function (seg) {
      var s = document.createElement("span");
      if (seg.c) s.className = seg.c;
      s.textContent = seg.t;
      el.appendChild(s);
    });
    return el;
  }

  /** Render the full terminal content statically (a11y + no-JS-friendly shell). */
  function renderFullTerminal() {
    var code = document.querySelector(".term-body code");
    if (!code) return;
    code.textContent = "";
    TERM_LINES.forEach(function (line) {
      code.appendChild(makeLineEl(line));
    });
    var cursor = document.createElement("span");
    cursor.className = "blink";
    cursor.textContent = "\u258d";
    code.appendChild(cursor);
  }

  /** Animate the terminal typing character by character (motion allowed only). */
  function animateTyping() {
    var code = document.querySelector(".term-body code");
    if (!code) return;
    code.textContent = "";

    var cursor = document.createElement("span");
    cursor.className = "blink";
    cursor.textContent = "\u258d";

    var lineIdx = 0;      // current line
    var charIdx = 0;      // chars printed in current line
    var lineEl = null;    // current line element
    var lineSpans = [];   // span elements for current line

    function buildLineEl(line) {
      var el = document.createElement("div");
      lineSpans = [];
      line.forEach(function (seg) {
        var s = document.createElement("span");
        if (seg.c) s.className = seg.c;
        s.textContent = "";
        el.appendChild(s);
        lineSpans.push({ el: s, text: seg.t });
      });
      return el;
    }

    function updateLine() {
      var remaining = charIdx;
      lineSpans.forEach(function (sp) {
        if (remaining <= 0) {
          sp.el.textContent = "";
        } else if (remaining >= sp.text.length) {
          sp.el.textContent = sp.text;
          remaining -= sp.text.length;
        } else {
          sp.el.textContent = sp.text.slice(0, remaining);
          remaining = 0;
        }
      });
    }

    function lineTotal(line) {
      var t = 0;
      line.forEach(function (s) { t += s.t.length; });
      return t;
    }

    function step() {
      if (lineIdx >= TERM_LINES.length) {
        code.appendChild(cursor);
        return;
      }
      var line = TERM_LINES[lineIdx];
      var total = lineTotal(line);

      if (!lineEl) {
        lineEl = buildLineEl(line);
        code.appendChild(lineEl);
      }

      if (charIdx < total) {
        charIdx++;
        updateLine();
        setTimeout(step, 26);
      } else {
        // done with this line -> advance
        lineIdx++;
        charIdx = 0;
        lineEl = null;
        var br = document.createElement("div");
        br.innerHTML = "&nbsp;";
        code.appendChild(br);
        setTimeout(step, 90);
      }
    }

    step();
  }

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  var io;
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
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
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          animateCount(e.target);
          cio.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ------------------------------------------------------------------
     Clock (footer, technical)
     ------------------------------------------------------------------ */
  function startClock() {
    var el = document.getElementById("clock");
    if (!el) return;
    function tick() {
      var d = new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      el.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  function init() {
    buildConics();
    initReveal();
    initCounters();
    startClock();
    // always render the full terminal baseline first (progressive enhancement)
    renderFullTerminal();
    if (!reduceMotion) {
      // then animate it in as it scrolls into view
      var term = document.querySelector(".term");
      if (term) {
        var seen = false;
        var to = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting && !seen) {
              seen = true;
              animateTyping();
              to.unobserve(e.target);
            }
          });
        }, { threshold: 0.4 });
        to.observe(term);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
