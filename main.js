/* ==========================================================================
   Conic Launcher — website behavior
   Minimal platform JS: reveal, counters, conic geometry, navigation,
   clock, theme, showcase video play/pause.
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
     Showcase demo videos — play only while in view; honour reduced motion.
     ------------------------------------------------------------------ */
  function initVideos() {
    var vids = document.querySelectorAll(".demo video");
    if (!vids.length) return;
    if (reduceMotion) {
      vids.forEach(function (v) {
        v.autoplay = false;
        v.pause();
      });
      return;
    }
    var vp = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          var p = v.play();
          if (p) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { vp.observe(v); });
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
     Lenis smooth scroll + custom scrollbar.
     Mirrors kindred launcher's ScrollView behavior: lerp 0.12, thin
     pill thumb, hidden native scrollbar. Honors reduced motion.
     ------------------------------------------------------------------ */
  function initSmoothScroll() {
    if (typeof window.Lenis !== "function") return;
    var scrollbar = document.querySelector(".vscrollbar");
    var thumb = document.querySelector(".vscrollbar-thumb");
    if (!scrollbar || !thumb) return;

    var lenis = new window.Lenis({
      lerp: reduceMotion ? 1 : 0.12,
      smoothWheel: !reduceMotion,
      anchors: !reduceMotion,
      autoRaf: true,
    });

    var MIN_THUMB = 32;
    var trackH = 0,
      maxScroll = 0,
      thumbH = 0,
      maxThumbTop = 0;

    function measure() {
      trackH = scrollbar.clientHeight;
      maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
    }

    function update() {
      measure();
      if (maxScroll <= 0) {
        scrollbar.classList.add("hidden");
        return;
      }
      scrollbar.classList.remove("hidden");
      thumbH = Math.max(
        MIN_THUMB,
        trackH *
          (window.innerHeight / document.documentElement.scrollHeight),
      );
      thumb.style.height = thumbH + "px";
      var clamped = Math.max(0, Math.min(maxScroll, lenis.scroll));
      maxThumbTop = trackH - thumbH;
      thumb.style.top =
        (maxThumbTop <= 0 ? 0 : (clamped / maxScroll) * maxThumbTop) + "px";
    }

    lenis.on("scroll", update);

    /* thumb drag */
    var dragging = false,
      trackTop = 0,
      dragOffset = 0;
    thumb.addEventListener("pointerdown", function (e) {
      dragging = true;
      trackTop = scrollbar.getBoundingClientRect().top;
      dragOffset = e.clientY - thumb.getBoundingClientRect().top;
      thumb.classList.add("dragging");
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch (err) {}
      e.preventDefault();
    });
    thumb.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var top = Math.max(0, Math.min(maxThumbTop, e.clientY - trackTop - dragOffset));
      if (maxThumbTop > 0 && maxScroll > 0) {
        lenis.scrollTo((top / maxThumbTop) * maxScroll, { immediate: true });
      }
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove("dragging");
      try {
        thumb.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    thumb.addEventListener("pointerup", endDrag);
    thumb.addEventListener("pointercancel", endDrag);

    /* track click — jump */
    scrollbar.addEventListener("pointerdown", function (e) {
      if (e.target === thumb) return;
      var top =
        e.clientY - scrollbar.getBoundingClientRect().top - thumbH / 2;
      top = Math.max(0, Math.min(maxThumbTop, top));
      if (maxThumbTop > 0 && maxScroll > 0) {
        lenis.scrollTo((top / maxThumbTop) * maxScroll, { immediate: true });
      }
    });

    /* recalc on layout / size changes */
    var resizeWatcher = new ResizeObserver(function () {
      lenis.resize();
      update();
    });
    resizeWatcher.observe(document.documentElement);

    update();
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  function init() {
    buildConics();
    initSmoothScroll();
    initVideos();
    initReveal();
    initCounters();
    startClock();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
