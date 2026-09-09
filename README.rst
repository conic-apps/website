.. meta::
   :title: Conic Website
   :description: Official website and download mirror for Conic Launcher
   :license: GPL-3.0

Conic Website
=============

The official marketing website and download mirror for `Conic Launcher <https://github.com/conic-apps/launcher>`_, a cross-platform Minecraft launcher. Built with zero dependencies — vanilla HTML, CSS, and JavaScript.

This repository contains two components:

- **Static website** — A single-page product landing site deployed to Cloudflare Pages.
- **Cloudflare Worker** — A download proxy that syncs launcher releases from GitHub into R2 storage and serves them at stable URLs.

.. image:: https://img.shields.io/github/license/conic-apps/website
   :target: https://github.com/conic-apps/website/blob/main/LICENSE
   :alt: License

.. image:: https://img.shields.io/github/actions/workflow/status/conic-apps/website/deploy.yml?branch=main&label=deploy
   :target: https://github.com/conic-apps/website/actions/workflows/deploy.yml
   :alt: Deployment Status

Project Status
--------------

- **Version:** 0.1
- **Platforms:** Windows, Linux, macOS
- **Languages:** 12
- **License:** GPL-3.0

Tech Stack
----------

===========  ===========================
Layer        Technology
===========  ===========================
Markup       HTML5
Styling      CSS3 (CSS custom properties)
JavaScript   Vanilla ES5-compatible
Smooth scroll Lenis v1.3.25 (vendored)
Fonts        Self-hosted WOFF2
Color system Catppuccin Mocha (HDR/P3 aware)
Deployment   Cloudflare Pages + Workers
CI/CD        GitHub Actions
===========  ===========================

There is no ``package.json``, no build step, no bundler, and no framework.

Local Development
-----------------

The site requires no installation. Open ``index.html`` directly in a browser, or use any static file server:

.. code-block:: bash

   # macOS
   open index.html

   # Python
   python3 -m http.server 8080

   # Node.js
   npx serve .

Cloudflare Worker
~~~~~~~~~~~~~~~~~

The download mirror (``dl.conicmc.app``) lives in the ``worker/`` directory.

.. code-block:: bash

   # Deploy with Wrangler
   cd worker
   wrangler deploy

The worker runs an hourly cron job to sync launcher releases from ``conic-apps/launcher`` into an R2 bucket. All assets of the latest release are mirrored flat using their original file names (older versions are pruned, keeping only the most recent ``KEEP_RELEASES``). Each file is SHA-256 verified against GitHub's digest before upload and retried up to 3 times; files that still fail are skipped and recorded in ``latest.json`` ``warnings``. Installers are served via redirect at ``/latest?os={os}&arch={arch}&kind={kind}``.

Endpoints:

- ``GET /latest?os=&arch=&kind=`` — 302 redirect to the matching latest asset (no params → redirect to ``/launcher/latest.json``)
- ``GET /launcher/<key>`` — Serve a mirrored asset directly (real file; responses include a ``Digest: sha-256=`` header)
- ``GET /launcher/latest.json`` — Versioned metadata (tag, platform/arch, sizes, hashes)
- ``GET /__sync`` — Trigger on-demand sync (token-protected)
- ``GET /v1/mirror/status`` — View sync status

Deployment
----------

Pushing to ``main`` triggers ``.github/workflows/deploy.yml``, which:

1. Deploys the ``worker/`` directory as a Cloudflare Worker
2. Deploys the static site (excluding ``worker/``, ``.github/``, ``.wrangler/``) to Cloudflare Pages

Project Structure
-----------------

::

   conic-apps/website/
   ├── index.html              # Single-page landing site
   ├── main.js                 # Scroll reveal, counters, conic geometry, nav, theme
   ├── styles.css              # Design system and responsive styles
   ├── assets/
   │   ├── favicon.svg         # SVG favicon (Conic bird mascot)
   │   ├── download/           # Platform icons
   │   ├── media/              # Screenshots and demo videos
   │   ├── skins/              # Skin preview images
   │   └── vendor/             # Lenis smooth scroll library
   ├── fonts/                  # Self-hosted WOFF2 fonts
   ├── worker/
   │   ├── index.js            # Worker logic (sync + R2 proxy)
   │   └── wrangler.toml       # Worker configuration
   └── .github/
       └── workflows/          # CI/CD pipelines

Features
--------

- Animated hero section with mathematically generated conic-section SVG backdrop
- 9 feature showcases with video demos and editorial layouts
- Dark/light theme toggle (Catppuccin Mocha + warm archival light theme)
- Scroll reveal animations with ``prefers-reduced-motion`` support
- Responsive design with hamburger menu for mobile
- Custom scrollbar with Lenis smooth scroll
- HDR/P3 wide-gamut color support
- Accessibility: skip-to-content link, reduced-motion support

Links
-----

- **Launcher source:** https://github.com/conic-apps/launcher
- **Launcher releases:** https://github.com/conic-apps/launcher/releases
- **Download mirror:** https://dl.conicmc.app
- **Issues:** https://github.com/conic-apps/launcher/issues
- **Mojang brand guidelines:** https://www.minecraft.net/en-us/usage-guidelines

Copyright
---------

Copyright 2022-2026 ConicMC (Broken-Deer and contributors).
Licensed under `GPL-3.0 <https://github.com/conic-apps/website/blob/main/LICENSE>`_.

Minecraft is a trademark of Mojang Synergies AB. This project is not affiliated with or endorsed by Mojang.
