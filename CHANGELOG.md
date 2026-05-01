# Changelog

All notable changes to Lumoravision will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.7] - 2026-05-01

### Changed
- Updated `@eslint/js` from 9.39.4 to 10.0.1
- Updated `@types/node` from 24.12.2 to 25.6.0
- Updated `eslint` from 9.39.4 to 10.2.1

---

## [1.1.6] - 2026-04-26

### Added
- **Image Slideshow** — fullscreen auto-play with Fade / Slide / Zoom transitions, configurable interval (2–10 s), progress dots / bar
- **Director Mode (Editor)** — browser-based non-linear clip sequencer with 7 transitions, frame-accurate trim panel and GIF export
- **Splitscreen Player** — compare two videos side by side with 4 layout modes and sync toggle
- **Storyboard view** — extract up to 100 frames from any video, export as PNG grid
- **Keyboard Shortcuts overlay** — press `?` anywhere to open (`ShortcutsModal`)
- **Error Boundary** — React error boundary for graceful crash handling
- **Playback position persistence** — resume videos from where you left off (`usePlaybackPosition`)
- **Thumbnail queue** — throttled thumbnail generation to prevent UI blocking (`thumbQueue`)
- **Docker support** — multi-stage Dockerfile (Node 24 Alpine → Nginx 1.29 Alpine) + `docker-compose.yml`
- **PWA manifest** — `public/manifest.json` for installable web app
- **App version** in About modal — reads from `package.json` automatically
- **SECURITY.md**, **CODE_OF_CONDUCT.md**, **CONTRIBUTING.md** — full GitHub community health files
- **Screenshot gallery** in README — app, player, editor, splitscreen, gif export, storyboard

### Changed
- Docker base images updated: `node:22` → `node:24` (LTS), `nginx:1.27` → `nginx:1.29`
- README completely rewritten — Privacy section, comparison table, Built With badges, Contributing guide, Made with ❤️ footer
- `resolveJsonModule: true` added to `tsconfig.app.json`

### Fixed
- Removed infinite `glowPulse` CSS animation that caused high CPU usage in idle
- Removed `backdrop-blur-xl` from Sidebar and Toolbar (GPU overhead)

---

## [1.1.5] - 2026-04-25

### Added
- **Playlist mode** — queue videos, "Add all N videos" button, panel with thumbnails
- **Auto scene detection** — Canvas pixel-diff analysis generates up to 20 chapters
- **GIF export** in Video Player — set start/end, FPS, width; 100% browser-side via gif.js Web Worker
- **Screenshot mode** — frame slider, ±1 s / ±10 s / ±60 s jump buttons, save as PNG
- **Frame-accurate navigation** — `,` / `.` to step one frame back/forward
- **Persistent folders** — IndexedDB storage via `usePersistedFolders` hook
- **Drag & Drop** — drag any folder onto the window to open it
- **List view** — alternative to grid view with inline thumbnails
- **Sort** by name, date, size, duration
- **Real-time search** across all files

### Changed
- Thumbnail generation moved to lazy IntersectionObserver (zero lag with 500+ files)
- Canvas thumbnails at native resolution (JPEG 92%, up to 1280 px)

---
