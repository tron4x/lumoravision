<p align="center">
  <img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/lumoravision.png" alt="Lumoravision Logo" width="180" />
</p>

<h1 align="center">✦ Lumoravision</h1>

<p align="center">
  <strong>Your local media library — reimagined. No cloud. No upload. No bullshit.</strong><br/>
  Drop a folder. Watch. Cut. Color-grade. Export GIFs and WebM. All in the browser.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.9-06B6D4?style=for-the-badge&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-CC_BY--NC_4.0-EF9421?style=for-the-badge&logo=creativecommons&logoColor=white" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Zero_Backend-100%25_Client--Side-06B6D4?style=for-the-badge&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/Your_Files_Stay_Local-🔒_Private-8B5CF6?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Made_by-tron4x-FF6B6B?style=for-the-badge&logo=github&logoColor=white" />
</p>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/app.png" alt="Lumoravision – Media Library" width="100%" />
</p>

<table align="center" width="100%" cellspacing="4" cellpadding="0" border="0">
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/player.png" alt="Video Player" width="100%" /></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/editor.png" alt="Editor" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/splitscreen.png" alt="Splitscreen" width="100%" /></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/gif.png" alt="GIF Export" width="100%" /></td>
  </tr>
</table>

<p align="center">
  <img src="https://raw.githubusercontent.com/tron4x/lumoravision/main/public/storyboard.png" alt="Lumoravision – Storyboard" width="100%" />
</p>

---

> [!TIP]
> **No installation. No account. No server. Just open your browser and drop a folder.**

---

## 🔒 Privacy & How It Works

> [!IMPORTANT]
> **Lumoravision does not upload, store or transmit any of your files — ever.**

Here is exactly what happens when you use the app:

| What happens | Detail |
|:---|:---|
| You open a folder | The browser asks for permission to **read** that folder — nothing is copied or moved |
| Thumbnails are generated | Done entirely in your browser via the **Canvas API** — no server involved |
| Videos are played | Streamed directly from your local disk via the **HTML5 Video API** — no upload |
| GIFs are exported | Encoded 100% in your browser via a **Web Worker** — downloaded directly to your machine |
| Folder paths are saved | Stored in your browser's **IndexedDB** (local only) so folders reopen after reload |
| **Nothing is sent anywhere** | No analytics, no telemetry, no cloud, no database, no backend |

**There is no server. There is no database. There is no account.**  
Your files stay exactly where they are — on your hard drive.

The only network requests Lumoravision ever makes are to load the app itself (HTML/CSS/JS). <br>After that, everything runs offline.

### Responsible use

Lumoravision is a local media tool. You are responsible for the files you open, edit, export or share with it.

- Only process media you own or are legally allowed to use.
- Do not use Lumoravision to infringe copyright, bypass platform rules, or distribute unlawful content.
- Exports (screenshots, GIFs, graded videos, storyboards) are created locally and saved to your machine; you are responsible for how they are used.

### Safety limits

Some features are intentionally capped to protect the browser from high memory usage or CPU spikes:

| Feature | Limit / behaviour | Reason |
|:---|:---|:---|
| Auto-Highlights | Max input duration: **30 minutes** | Prevents out-of-memory crashes during audio/video analysis |
| Color-grade video export | **Real-time** WebM recording | Browser-native MediaRecorder must play/record the video in real time |
| GIF export | Configurable FPS/width and cancellable progress | Prevents runaway memory usage on long/high-res clips |
| Thumbnails / previews | Queued and lazy-loaded | Keeps large folders responsive |

If you need longer/heavier exports, use the browser export as a preview step and finish in a desktop editor such as DaVinci Resolve, Premiere, or FFmpeg.

### No backend by design

Lumoravision intentionally ships without backend uploads, accounts, analytics or cloud processing. This reduces abuse risk and keeps private media private. If a future deployment adds a backend, it must add proper authentication, rate limits, upload quotas, server-side file validation and abuse reporting.

### License / branding / no commercial use

> [!IMPORTANT]
> **Commercial use of Lumoravision is not allowed.**
>
> Lumoravision is licensed under **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** — see [`LICENSE`](./LICENSE).
>
> You may use, study, modify and share Lumoravision for **personal, private and non-commercial purposes only**, with appropriate attribution to the author. You may **not** sell it, sublicense it, host it as a paid service, bundle it into a paid product, run paid ads against it, or otherwise monetise it or any derivative without prior written permission from the author.
>
> The project name (**Lumoravision**), the logo, screenshots and other branding are **not** licensed for commercial use either. Trademarks are reserved.
>
> For a commercial licence, contact the author: <https://github.com/tron4x>.

---

## 🔥 Why Lumoravision?

> **Plex is overkill. VLC is ugly. Finder is a joke.**

Lumoravision is a **browser-based media player and editor** that runs entirely on your machine — no server, no account, no subscription. Open a folder and you instantly get:

- 🎬 **A beautiful video grid** with hover previews and auto-generated thumbnails
- ✂️ **A full clip editor** with transitions, frame-accurate trimming and GIF export
- 🎞️ **WebM export** of any timeline — render the cut to a real video file in your browser
- 🎨 **LUT-based color grading** with presets and custom `.cube` files; export the graded result as WebM
- ✨ **Auto-Highlights** — generate a short best-of reel from any video using motion + audio analysis
- 🔍 **Auto scene detection** — chapters generated from pixel analysis, no AI API needed
- 📸 **Storyboard view** — extract up to 100 frames from any video in seconds
- ⬛⬛ **Splitscreen comparison** — two videos side by side, synced or independent
- 🗂️ **Collections** — group videos and images across folders with colored labels (persisted in IndexedDB)
- 🎵 **Playlist mode** — queue videos and binge without touching the keyboard
- 🖼️ **Image Slideshow** — fullscreen slideshow with fade/slide/zoom transitions and auto-play

**Everything runs in your browser. Your files never leave your computer.**

---

## ⚡ 30-Second Setup

```bash
git clone https://github.com/tron4x/lumoravision.git
cd lumoravision
npm install && npm run dev
```

Open **http://localhost:5173** → drag a folder onto the window → done.

Or use **Docker** (no Node.js needed):

```bash
docker compose up -d --build
# → http://localhost:8080
```

---

## ✨ Feature Highlights

### 🎬 Video Grid & Library

- Supports **MP4, MOV, WebM, MKV, AVI, OGV, M4V, WMV, FLV, 3GP, TS** and more
- **Canvas thumbnails** generated at native resolution (JPEG 92%, up to 1280 px), lazy-loaded via IntersectionObserver — zero lag even with 500+ files
- **Hover preview** — video plays inline after 150 ms, no click needed
- **Color-coded format badges** per extension so you spot your MKVs at a glance
- **Grid view** (2–7 responsive columns) and **List view** with inline thumbnails
- **Real-time search** across all files as you type
- **Sort** by name, date, file size or video duration
- **Drag & Drop** — drag any folder directly onto the window to open it instantly
- **Persistent folders** — Chrome/Edge restore your folders automatically after reload

---

### ▶️ Full-Screen Video Player

- Prev / Next navigation (`Alt+←` / `Alt+→`)
- **Playback speed**: 0.25× · 0.5× · 0.75× · 1× · 1.25× · 1.5× · 1.75× · 2×
- **Loop mode** with on-screen indicator
- **Auto chapter detection** — scene analysis runs in the browser using Canvas pixel-diff; generates up to 20 chapters snapped to real scene cuts, shown as a scrollable thumbnail strip
- **Smart-Scrub hover preview** — hover the progress bar to see a thumbnail of that exact second; previously-hovered frames are cached and reappear instantly
- **Frame-accurate navigation** — step one frame forward/backward with `,` / `.`
- **Resume playback position** — videos remember where you left off
- **Screenshot mode** — frame slider, quick-jump buttons (±1 s, ±10 s, ±60 s), save as PNG
- **GIF export** — set start/end time, FPS and width; exported entirely in the browser via gif.js Web Worker. Includes a "Frames" filmstrip and a "Scenes" picker that runs scene detection so you can lock the GIF range to a clean cut.
- Controls auto-hide after 3 s during playback
- Native fullscreen + maximize mode

---

### 🎨 Color Grading — LUT Shader + WebM Export

The `ColorGradePanel` adds professional-style colour grading on top of the playing video, entirely in WebGL.

- **Built-in presets** — Teal & Orange, Bleach Bypass, Vintage Film, High Contrast, Cool/Warm and more
- **Custom LUT support** — drag-and-drop any `.cube` file (parsed by `lutLoader.ts`)
- **Live trilinear lookup** in a fragment shader — runs at native frame rate, capped to 1280 px max edge to keep mobile GPUs happy
- **Intensity slider** for partial-strength looks
- **Compare mode** — split-view slider with the original on one side and the graded result on the other
- **Apply** to lock the active look (panel turns into a small floating badge so the grade survives even after closing the panel)
- **Export graded video as WebM** — `MediaRecorder` records the WebGL canvas plus the source audio in real time; downloads as `graded-<look>-<timestamp>.webm`
- WebGL resources are explicitly released on unmount (programs, textures, buffers, context-loss extension)

---

### ✨ Auto-Highlights — Best-of Reel Generator

The `HighlightsModal` analyses a single video and returns the most interesting moments as a short reel.

- **Motion analysis** via a dedicated Web Worker (`frameDiff.worker.ts`) — frame-to-frame difference scoring
- **Audio energy analysis** — RMS / peak detection over the audio track
- **Configurable** target reel length, clip length and motion-vs-audio weight
- **Heat-map preview** of the per-second interest score, with the picked highlight ranges overlaid
- **Cancellable** progress with a `cancelRef`-driven loop and a re-probe step for stubborn metadata
- **Hard input cap of 30 minutes** to prevent OOM during audio decode (documented in the panel + the Privacy section above)
- Picked ranges can be added straight to the Editor timeline

---

### ✂️ Editor (Director Mode) — *The star of the show*

The Editor is a **browser-based non-linear clip sequencer**. No Premiere. No DaVinci. Just open it and start cutting.

**Timeline**
- Add any video from your library to the timeline
- Reorder clips with up/down arrows
- Remove clips with ✕
- Chapter strip shows all clips as thumbnails for instant navigation

**7 Transitions** between every clip pair:

| Transition | Effect |
|:---|:---|
| ✂️ Cut | Instant hard cut |
| 🌅 Fade | Fade to black and back |
| 🔀 Dissolve | Quick cross-dissolve |
| 🔍 Zoom In | Zoom-in push |
| ⬅️ Slide Left | Slide out left, slide in right |
| ➡️ Slide Right | Slide out right, slide in left |
| ⚡ Flash | White flash cut |

**Frame-Accurate Trim Panel**
- **Frame Scrubber** — shared `FrameScrubber` component (also used by the Player's GIF panel) — canvas preview shows the exact frame at any position; step frame-by-frame (1/30 s) or jump ±1 s
- **Set IN / Set OUT** buttons — lock your cut points to the exact frame you see
- **IN / OUT sliders** for quick rough trimming
- **Auto Scene Detection** — click "Scenes" to run pixel-diff analysis on the clip; detected scenes appear as clickable thumbnails to set IN/OUT instantly

**Playback**
- Preview the full sequence with all transitions live in the built-in player
- `Space` to play/pause, `Esc` to close

**GIF Export**
- Configure **FPS** (5 / 8 / 10 / 12 / 15 / 20 / 24 / 25 / 30) and **Width** (320 / 480 / 640 / 800 px)
- Full IN→OUT duration of every clip is used automatically
- Progress bar: frame capture (0–60%) + GIF encoding (60–100%)
- **Cancel** at any time
- Downloaded automatically as `editor-export-[timestamp].gif`
- 100% browser-side via gif.js Web Workers — no server, no upload

**WebM Export**
- Render the entire timeline (clips + trim points + transitions) to a real `.webm` video
- Real-time pipeline: each clip is *played*, the canvas compositor is captured via `captureStream(fps)` and recorded with `MediaRecorder` (`webmExport.ts`)
- Auto codec selection (VP9 → VP8) with a `MediaRecorder.isTypeSupported` pre-flight
- Patches the missing `Duration` header in the resulting WebM so players can seek the result
- Cancellable with bounded async timeouts; full cleanup of paint loop, recorder, stream tracks and hidden `<video>` elements

---

### 🗂️ Collections

- Create labelled, color-coded **collections** that span across all open folders
- Toggle videos and images into a collection from the card menu
- The sidebar shows your collections with their member count
- Persisted in **IndexedDB** so they survive reloads (no cloud)
- A dedicated `CollectionModal` lets you rename, recolor, add/remove members and delete collections

---

### 📋 Storyboard

- Visual overview of all frames extracted from a video
- Configurable frame count (10 / 20 / 30 / 50 / 100) and grid columns (3–10)
- Click any frame to open an inline preview with play/pause
- Save individual frames as full-resolution PNG
- Export the entire storyboard as a single PNG image
- "Open in Player" to jump to the selected frame in the main player

---

### ⬛⬛ Splitscreen Player

- Compare two videos side by side in the same window
- **4 layout modes**: Side-by-side · Top/Bottom · Picture-in-Picture left · Picture-in-Picture right (switch with `1`–`4`)
- **Sync mode**: both videos seek and play together; toggle to independent mode with `S`
- Separate progress bars and volume controls per video

---

### 🎵 Playlist

- Add individual videos via the `+` button on each card
- "Add all N videos" to queue the entire current view
- Playlist panel with thumbnails, play and clear buttons
- Falls back to all filtered videos as the queue when no playlist is active

---

### 🖼️ Image Viewer & Slideshow

- Supports **JPG, PNG, GIF, WebP, AVIF, BMP, TIFF, SVG, HEIC**
- Full-screen viewer with left/right navigation
- **Slideshow mode** — fullscreen auto-play with configurable interval (2 / 3 / 5 / 8 / 10 s) and 3 transitions (Fade · Slide · Zoom)
- Progress dots (≤20 images) or progress bar (>20 images)
- Keyboard: `Space` (play/pause) · `←` `→` (navigate) · `F` (fullscreen) · `Esc` (close)
- Grid and List view

---

### 🔐 Lock Screen + Easter Egg

- Type `lockme` anywhere in the app to put it behind a **Lock Screen**. The lock survives reloads via `localStorage` and unlocks with the same password you set on the lock screen.
- Type `tron4x` for an animated developer-credit Easter Egg (logo float, starfield, scrolling credits, particle burst on close). Honours `prefers-reduced-motion`.

---

## ⌨️ Keyboard Shortcuts

Press `?` anywhere to open the shortcuts overlay.

**Video Player**

| Key | Action |
|:---|:---|
| `Space` / `K` | Play / Pause |
| `←` / `→` | Seek ±10 s |
| `J` / `L` | Seek ±10 s (YouTube style) |
| `Alt+←` / `Alt+→` | Previous / Next video |
| `↑` / `↓` | Volume ±10% |
| `M` | Toggle mute |
| `R` | Toggle loop |
| `,` / `.` | Step one frame back / forward |
| `S` | Save screenshot (PNG) |
| `Esc` | Close player |

**Editor**

| Key | Action |
|:---|:---|
| `Space` | Play / Pause current clip |
| `Esc` | Close picker or close Editor |

**Slideshow**

| Key | Action |
|:---|:---|
| `Space` | Play / Pause |
| `←` / `→` | Previous / Next image |
| `F` | Toggle fullscreen |
| `Esc` | Close slideshow |

**Global**

| Key | Action |
|:---|:---|
| `?` | Toggle keyboard shortcuts overlay |
| `lockme` | Activate the persistent Lock Screen |
| `tron4x` | Open the developer-credit Easter Egg |

---

## 🔄 Browser Compatibility

| Browser | Open Folder | Auto-restore after Reload |
|:---|:---:|:---:|
| **Chrome / Edge** | ✅ Native OS dialog | ✅ Fully automatic |
| **Brave** | ✅ Native OS dialog | ⚠️ One confirmation click |
| **Firefox** | ✅ Fallback picker | ❌ Manual re-open required |
| **Safari** | ✅ Fallback picker | ❌ Manual re-open required |

> [!NOTE]
> Chrome and Edge implement the full **File System Access API** including persistent permissions via `IndexedDB`. This lets Lumoravision restore your folders automatically after a reload — no interaction needed.
>
> Firefox and Safari only partially support this API. Folders that need to be reopened are highlighted in **amber** in the sidebar. This is a browser security decision, not a bug in Lumoravision.

---

## 🐳 Docker

```bash
# Build and run (recommended)
docker compose up -d --build
# → http://localhost:8080

# Or manually
docker build -t lumoravision:latest .
docker run -d --name lumoravision -p 8080:80 --restart unless-stopped lumoravision:latest
```

| File | Purpose |
|:---|:---|
| `Dockerfile` | Multi-stage: Node 24 Alpine (build) → Nginx 1.29 Alpine (serve) |
| `nginx.conf` | SPA routing, gzip, aggressive asset caching, security headers |
| `docker-compose.yml` | One-command start on port 8080 |

### Public deployment hardening

The Docker/Nginx setup includes security headers for public deployments:

- `Content-Security-Policy` restricts scripts, frames, objects and network destinations.
- `X-Content-Type-Options: nosniff` reduces MIME confusion attacks.
- `X-Frame-Options: SAMEORIGIN` blocks most clickjacking embeds.
- `Referrer-Policy: strict-origin-when-cross-origin` limits referrer leakage.
- `Permissions-Policy` disables camera, microphone, geolocation, payment, USB and Bluetooth APIs.

No API keys or secrets are required for normal operation. Do not add secrets to the frontend; anything bundled into a browser app is public.

### Performance & bundle size

The app is **code-split with `React.lazy`** so the initial page load only ships the chrome (Sidebar, Toolbar, cards, splash). Heavy modals like the Editor, ColorGrade, Storyboard, Splitscreen, Slideshow, ImageViewer, HighlightsModal, FrameScrubber and the Easter Egg are loaded on demand. Vendor splits for `react` and `gifjs` are declared in `vite.config.ts`. Initial gzipped payload is around **78 kB**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|:---|:---|
| Framework | React 19 |
| Language | TypeScript 6 |
| Styling | Tailwind CSS 4 |
| Build tool | Vite 8 |
| Persistence | IndexedDB + File System Access API |
| Thumbnails | HTML5 Canvas API (lazy, IntersectionObserver) |
| Video | HTML5 Video API (native, zero memory leaks) |
| GIF Export | gif.js (Web Worker, 100% browser-side) |
| WebM Export | `MediaRecorder` + `canvas.captureStream` (real-time, browser-native) |
| Color Grading | WebGL fragment shader + 2D-atlas LUT (parser for `.cube` files) |
| Auto-Highlights | Web Worker frame diff + audio RMS analysis |
| Scene Detection | Canvas pixel-diff analysis (no external library) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── VideoCard.tsx          # Grid card with thumbnail + hover preview
│   ├── VideoListRow.tsx       # List row with thumbnail + hover preview
│   ├── VideoPlayer.tsx        # Full-screen video player
│   ├── ColorGradePanel.tsx    # WebGL LUT colour grading + WebM export
│   ├── HighlightsModal.tsx    # Auto-Highlights generator UI
│   ├── FrameScrubber.tsx      # Reusable filmstrip + IN/OUT scrubber
│   ├── ImageCard.tsx          # Image grid card
│   ├── ImageViewer.tsx        # Full-screen image viewer
│   ├── Slideshow.tsx          # Fullscreen image slideshow
│   ├── Sidebar.tsx            # Folder navigation
│   ├── CollectionModal.tsx    # Manage collections (rename, recolor, members)
│   ├── Toolbar.tsx            # Search, sort, view toggle, Editor button
│   ├── Storyboard.tsx         # Frame overview & export
│   ├── SplitscreenPlayer.tsx  # Side-by-side video comparison
│   ├── DirectorMode.tsx       # Editor: clip sequencer + GIF/WebM export
│   ├── PlaylistItem.tsx       # Playlist panel item
│   ├── SplashScreen.tsx       # Animated intro
│   ├── ShortcutsModal.tsx     # Keyboard shortcuts overlay
│   ├── LockScreen.tsx         # Persistent password lock (lockme)
│   ├── EasterEgg.tsx          # Developer-credit overlay (tron4x)
│   ├── ErrorBoundary.tsx      # React error boundary
│   └── InfoModal.tsx          # About dialog
├── hooks/
│   ├── useFileSystem.ts       # Folder reading + persistence
│   ├── usePersistedFolders.ts # IndexedDB storage
│   ├── useCollections.ts      # Collections state + IndexedDB persistence
│   ├── usePlaybackPosition.ts # Resume playback position
│   └── useSort.ts             # Sorting logic
├── utils/
│   ├── format.ts              # File size, duration, date formatting
│   ├── gifExport.ts           # GIF export via gif.js
│   ├── webmExport.ts          # Editor timeline → WebM via MediaRecorder
│   ├── lutLoader.ts           # .cube LUT parser + 2D atlas builder
│   ├── lutPresets.ts          # Built-in colour-grading presets
│   ├── highlightDetection.ts  # Audio + motion analysis for Auto-Highlights
│   ├── scrubThumbs.ts         # Smart-Scrub hover-preview thumbnails
│   ├── thumbCache.ts          # Bounded LRU thumbnail cache
│   ├── thumbQueue.ts          # Thumbnail generation queue
│   └── sceneDetection.ts      # Auto chapter / scene detection
├── workers/
│   └── frameDiff.worker.ts    # Web Worker for frame-difference scoring
└── types/
    └── video.ts               # TypeScript types
```

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

1. **Fork** the repository
2. **Create** your feature branch: `git checkout -b feature/my-feature`
3. **Commit** your changes: `git commit -m 'feat: add my feature'`
4. **Push** to the branch: `git push origin feature/my-feature`
5. **Open** a Pull Request

Please check the [open issues](https://github.com/tron4x/lumoravision/issues) before submitting a new one.

---

## 🌟 Show Your Support

If Lumoravision saves you time or you just like what it does — **leave a star** ⭐  
It helps others find the project and motivates further development.

<a href="https://github.com/tron4x/lumoravision/stargazers">
  <img src="https://img.shields.io/github/stars/tron4x/lumoravision?style=social" alt="GitHub Stars" />
</a>

---

## 🏗️ Built With

<p>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" /></a>
  <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" /></a>
  <a href="https://jnordberg.github.io/gif.js/"><img src="https://img.shields.io/badge/gif.js-Web_Worker-FF6B6B?style=flat-square" /></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API"><img src="https://img.shields.io/badge/File_System_Access_API-Browser-8B5CF6?style=flat-square&logo=html5&logoColor=white" /></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" /></a>
</p>

---

## 👤 Developer

<p>
  <strong>tron4x</strong> &nbsp;·&nbsp;
  <a href="https://github.com/tron4x">github.com/tron4x</a>
</p>

---

## 📄 License

**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** — see [`LICENSE`](./LICENSE) for the full legal text, or <https://creativecommons.org/licenses/by-nc/4.0/> for a human-readable summary.

In short:

- ✅ You may use, study, modify and redistribute Lumoravision for **personal, educational and non-commercial** purposes.
- ✅ You must give appropriate **attribution** to the author (tron4x) and link back to this repository.
- ❌ You may **not** use Lumoravision or any derivative for any **commercial** purpose without a separate written licence from the author.
- ❌ The project **name, logo and branding** are not part of the CC licence and may not be used for commercial purposes.

For a commercial licence, contact the author at <https://github.com/tron4x>.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/tron4x">tron4x</a>
</p>
