# Changelog

All notable changes to Lumoravision will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.1] - 2026-05-17

### Added
- **Filmstrip Frame Navigation in VideoPlayer**:
  - New "Frames" button in the title bar next to "Chapters"
  - FrameScrubber panel with 16-frame filmstrip preview
  - Draggable IN/OUT markers (green/red) for precise range selection
  - Frame-by-frame navigation with ±1 frame and ±1s buttons
  - Quick actions: Reset, Go to IN, Go to OUT
  - Direct integration with GIF export and Screenshot features
  - Amber-colored UI accent to distinguish from Chapters

### Performance
- **React.memo optimization for list components**:
  - `VideoCard` wrapped in `memo()` — prevents unnecessary re-renders when scrolling through large video collections
  - `ImageCard` wrapped in `memo()` — same optimization for image galleries
  - `PlaylistItem` wrapped in `memo()` — playlist items no longer re-render on parent state changes
  - Reduces React reconciliation work significantly for folders with 100+ items

### Fixed
- **WebM export stuttering/hanging** during playback:
  - Increased default bitrate from 5 Mbps to 8 Mbps for better quality
  - Added `recorder.start(1000)` timeslice to force keyframes every 1 second, preventing decoder stalls
- **VideoPlayer muted by default** — video now starts with audio muted (user can unmute via M key or volume control)
- **Filmstrip initialization** — uses ref-based tracking to avoid stale closure issues in onLoadedMetadata handler

### Changed
- Updated version to 1.2.1

---

## [1.1.9] - 2026-05-14

### Added
- **Easter Egg complete redesign**:
  - Floating, glowing Lumoravision logo (no rotation — stays upright) over a brand-coloured canvas starfield (~140 cyan/purple particles with motion-blur trails)
  - Shimmering wordmark with horizontal gradient animation
  - Movie-style auto-scrolling credits with masked top/bottom edges
  - Two ambient orbs drift slowly in the corners for depth
  - **Outro sequence**: when "✦ fin ✦" scrolls past the top of the credits mask, the logo bursts into ~180 glowing canvas particles that fly outward through the starfield with light drag and per-particle decay (5.5–11 s lifetimes for a gradual dissipation). Tagline + credits fade out in parallel; the egg auto-closes after 9 s and the app's main page is back.
  - Pure-CSS animations for the float / glow / shimmer / credits scroll; single rAF loop on the canvas drives both stars and explosion particles. Visibility-change-aware pause (0 % CPU when the tab is in the background) and full unmount cleanup. Honours `prefers-reduced-motion`.
  - Outro trigger uses DOM-position polling (`getBoundingClientRect` on the "fin" element vs. the credits mask) instead of CSS `onAnimationEnd` — more reliable across browsers, plus a hard fallback timeout in case polling misfires.
  - The previous GIF-carousel implementation was removed entirely.

### Performance
- **Bundle code-splitting** — the app's biggest contributors are now separate chunks loaded on demand instead of one 500 kB monolith:
  - Initial page load: ~78 kB gzipped (down from ~132 kB) — the index chunk + React, nothing else
  - Each modal / heavy component is its own lazy-loaded chunk: `VideoPlayer` (16 kB), `DirectorMode` (15 kB), `SplitscreenPlayer` (5 kB), `Storyboard` (4 kB), `CollectionModal` (4 kB), `Slideshow` (3 kB), `EasterEgg` (4 kB), `LockScreen` (2 kB), `ImageViewer` (3 kB), `InfoModal` (3 kB), `ShortcutsModal` (1 kB), `FrameScrubber` (4 kB), `gif.js` vendor (4 kB) — sizes are gzipped
  - `vite.config.ts` declares `manualChunks` for the `react` and `gifjs` vendor splits; `App.tsx` wraps every modal in `React.lazy` + a single shared `<Suspense>` fallback (a tiny full-screen spinner)
  - Vite's "chunks larger than 500 kB" warning is gone

### Fixed
- **Critical: IndexedDB version race condition** between `useCollections` (DB v2) and `usePersistedFolders` (DB v1) sharing the same `videoplayer-db`. When `useCollections` initialised the DB first, `usePersistedFolders.openDB()` would silently fail with a `VersionError`, causing folder handles to never be loaded — manifesting as the "Reload" button doing nothing and the misleading message *"No saved handle for this folder — please reopen it."* Both modules now agree on `DB_VERSION = 2` and their `onupgradeneeded` handlers idempotently create both stores, regardless of initialisation order.
- **Reload button (`rescanFolder`)** now re-acquires read permission via `queryPermission` → `requestPermission` before reading. Some browsers (Brave, occasionally Chrome) drop folder permissions across navigations; the click handler is a user gesture so the prompt actually appears.
- **Reload button — fallback lookup by folder name** when the IndexedDB `id` doesn't match (typical for folders loaded via the fallback `FileList` API in Brave/Firefox/Safari, or after the workspace experiments). When still no handle is found, the user gets a clear actionable message ("Click 'Add Folder' and pick the same folder once …") instead of a cryptic "no saved handle" error, and the folder is marked `needsReopen` so the sidebar surfaces the amber "↺ Click to reopen" affordance.

### Changed
- Updated `useFileSystem.rescanFolder` to surface the real underlying error message instead of the generic "Could not rescan folder.", and to mark the folder as `needsReopen` whenever any failure occurs (permission denied, folder deleted, folder renamed).
- `vite.config.ts` extended with a `build.rollupOptions.output.manualChunks` function and `chunkSizeWarningLimit: 600`.
- `App.tsx` switched all heavy modal-only components from eager imports to `React.lazy(() => import(...))`; eagerly-imported components are now only the always-visible chrome (`Sidebar`, `Toolbar`, `VideoCard`, `VideoListRow`, `ImageCard`, `SplashScreen`, `PlaylistItem`, `NewCollectionDialog`).

### Removed
- `public/t/` GIF assets and the GIF-carousel logic in `EasterEgg.tsx` (replaced by the logo + credits + particle-burst sequence).

### Verified (no changes needed)
- Object-URL lifecycle audit: every `URL.createObjectURL` has a matching `URL.revokeObjectURL` on folder removal / replacement / unmount.
- Event-listener audit: every `addEventListener` has a matching `removeEventListener` in the corresponding cleanup.
- Timer audit: every `setInterval` / `setTimeout` is held in a ref and cleared on unmount or when the relevant state changes.
- WebGL/Canvas/hidden-`<video>` cleanup paths verified across `ColorGradePanel`, `Storyboard`, `FrameScrubber`, `scrubThumbs`, `webmExport`, `HighlightsModal`.
- EasterEgg leak audit: rAF loops, all listeners (keydown, resize, visibilitychange), JS timeouts, the `spawnExplosionRef` and the closure-scoped particle/star arrays all clean up on unmount or phase change. StrictMode-safe.

---

## [1.1.8] - 2026-05-14

### Added
- **Color Grading panel (`ColorGradePanel`)** — WebGL-based LUT shader overlaid on the playing video; exports the graded result as WebM via `MediaRecorder`.
- **Auto Highlights** — short-form "best-of" reel generation from a single video using motion + color analysis (`HighlightsModal`, `highlightDetection.ts`, `frameDiff.worker.ts`).
- **Smart-Scrub hover preview** in the Video Player progress bar — generates one-second-resolution thumbnails on demand via a coalescing seek pump (`scrubThumbs.ts`); previously-hovered frames are cached and re-show instantly.
- **Reusable `FrameScrubber` component** — the filmstrip + draggable IN/OUT scrubber used in the Editor is now also available in the regular Player's GIF-export panel via a "Frames" toggle, and a "Scenes" picker that runs scene detection then lets you click a scene to use it as the GIF range.
- **WebM Export** in the Editor — render the timeline (clips + trim points) to a single WebM by playing each clip in real time and recording the canvas compositor with `MediaRecorder` (`webmExport.ts`). Supports VP9/VP8 codec auto-selection and patches the missing `Duration` header so players can seek the result.
- **Persistent Lock Screen** — `lockme` keyword puts the app behind a `LockScreen`; the lock survives reloads via localStorage.
- **Easter Egg** — type `tron4x` anywhere in the app for a developer credit overlay.

### Fixed
- **WebM exports no longer hang or error out.** Replaced the previous frame-by-frame seek approach with a real-time playback pipeline: pre-flight `MediaRecorder.isTypeSupported` check (no construction with unsupported types), `captureStream(fps)` for steady frame supply, a continuous rAF paint-loop independent of `requestVideoFrameCallback`, single-chunk `recorder.start()` to avoid empty-timeslice races, explicit timeouts on every async step (no infinite hangs), `Promise.race`-bounded stop, and full cleanup in `finally` (paint loop, recorder, stream tracks, hidden `<video>` elements). Empty outputs throw clearly instead of silently returning a 0-byte file.
- **Storyboard `react-hooks/exhaustive-deps` warning** — the cleanup of the mount effect now captures the `generationIdRef` object in the effect's closure (as a local `const idRef`), so the cleanup uses the captured reference instead of reading `.current` directly.

### Changed
- DirectorMode now imports the shared `FrameScrubber` component instead of an inline copy.
- VideoPlayer's GIF panel exposes the same Frames + Scenes workflow as the Editor (with purple accents matching the panel's theme).

---

## [1.1.7] - 2026-05-01

### Changed
- Updated `@eslint/js` from 9.39.4 to 10.0.1
- Updated `@types/node` from 24.12.2 to 25.6.0
- Updated `eslint` from 9.39.4 to 10.2.1

### Fixed
- Images are now sorted along with videos (by name, size, date)

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
