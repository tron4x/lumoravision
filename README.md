<p align="center">
  <img src="public/lumoravision.png" alt="Lumoravision Logo" width="200" />
</p>

<h1 align="center">Lumoravision</h1>

<p align="center">
  <strong>A fast, modern browser-based media player — no installation, no server, no cloud.</strong><br/>
  Just open a folder and start watching.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-Apache_2.0-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="https://github.com/tron4x/lumoravision/stargazers"><img src="https://img.shields.io/github/stars/tron4x/lumoravision?style=for-the-badge&color=yellow" alt="Stars" /></a>
  <a href="https://github.com/tron4x/lumoravision/issues"><img src="https://img.shields.io/github/issues/tron4x/lumoravision?style=for-the-badge&color=red" alt="Issues" /></a>
  <a href="https://github.com/tron4x/lumoravision/commits/main"><img src="https://img.shields.io/github/last-commit/tron4x/lumoravision?style=for-the-badge&color=blue" alt="Last Commit" /></a>
</p>

---

## ⚡ Fast & User-Friendly

Lumoravision is built to be ready instantly — no setup, no accounts, no waiting:

- 🚫 **No upload, no server** – your files never leave your computer
- ⚡ **Lightning-fast thumbnails** – canvas-generated at native resolution, cached in memory, lazy-loaded via IntersectionObserver
- 👁️ **Hover preview** – videos start playing automatically on hover after 150 ms, no click needed
- ⌨️ **Keyboard-first** – all major actions accessible via shortcuts
- 🔍 **Instant search** – filters videos and images in real time as you type
- 💾 **Persistent folders** – automatically restored on next launch *(browser-dependent, see below)*

---

## ✨ Features

<details>
<summary><strong>📁 File Management</strong></summary>
<br/>

- Open local folders via the native OS dialog
- Manage multiple folders simultaneously in the sidebar
- Sidebar shows folder name, video count and a "needs reopen" warning (amber) for browsers that lost access after reload
- Rescan a folder to pick up newly added files
- Sort by name, date, file size or video duration
- Real-time search across all files in the active folder

</details>

<details>
<summary><strong>🎬 Video Grid & List</strong></summary>
<br/>

- Supported formats: MP4, MOV, WebM, MKV, AVI, OGV, M4V, WMV, FLV, 3GP, TS and more
- Color-coded format badges per extension (blue = MP4, purple = MOV, green = WebM, orange = MKV, red = AVI, …)
- High-quality canvas thumbnails (JPEG 92%, up to 1280 px wide), generated lazily when the card enters the viewport
- Hover preview: video plays inline after 150 ms, pauses and resets on mouse leave
- Duration badge on every card
- Per-card hover actions: **Storyboard**, **Splitscreen**, **Add to Playlist**
- Grid view (responsive, 2–7 columns) and List view

</details>

<details>
<summary><strong>▶️ Full-Screen Video Player</strong></summary>
<br/>

- Prev / Next navigation (keyboard: `Alt+←` / `Alt+→`)
- Playback speed: 0.25× · 0.5× · 0.75× · 1× · 1.25× · 1.5× · 1.75× · 2×
- Loop mode with on-screen indicator
- Volume slider + mute toggle
- Progress bar with chapter markers and hover tooltip
- **Auto chapter detection** – scene analysis runs entirely in the browser using Canvas; generates up to 20 chapters snapped to real scene cuts
- Chapter strip with thumbnails and timestamps (scrollable, fixed height)
- **Frame-accurate navigation** – step forward/backward one frame (~1/30 s) with `,` / `.`
- **Screenshot mode** – frame slider, quick-jump buttons (±1 s, ±10 s, ±60 s), save as PNG
- **GIF export** – set start/end time, FPS (5/10/15/20) and width (240–640 px); progress bar; exported entirely in the browser via gif.js Web Worker; max 30 s to prevent browser hang
- Controls auto-hide after 3 s during playback; reappear on mouse move
- Maximize mode (fills the viewport)
- Native fullscreen support

</details>

<details>
<summary><strong>⌨️ Keyboard Shortcuts (Video Player)</strong></summary>
<br/>

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

</details>

<details>
<summary><strong>📋 Storyboard</strong></summary>
<br/>

- Visual overview of all frames extracted from a video
- Configurable frame count (10 / 20 / 30 / 50 / 100) and grid columns (3–10)
- Click any frame to open an inline preview with play/pause
- Save individual frames as full-resolution PNG
- Export the entire storyboard as a single PNG image
- "Open in Player" button to jump to the selected frame in the main player

</details>

<details>
<summary><strong>⬛⬛ Splitscreen Player</strong></summary>
<br/>

- Compare two videos side by side in the same window
- **4 layout modes**: Side-by-side · Top/Bottom · Picture-in-Picture left · Picture-in-Picture right (switch with keys `1`–`4`)
- **Sync mode**: both videos seek and play together; toggle to independent mode with `S`
- Separate progress bars and volume controls for each video
- Change the right-panel video at any time via the video selector
- Controls auto-hide during playback

</details>

<details>
<summary><strong>🎵 Playlist</strong></summary>
<br/>

- Add individual videos to the playlist via the `+` button on each card or list row
- "Add all N videos" shortcut to queue the entire current view
- Playlist panel (sidebar, right side) with thumbnails, drag-to-reorder-ready list
- Play / Clear buttons in the panel header
- If no playlist is active, the player uses all filtered videos as the play queue automatically

</details>

<details>
<summary><strong>🖼️ Image Viewer</strong></summary>
<br/>

- Supported formats: JPG, PNG, GIF, WebP, AVIF, BMP, TIFF, SVG, HEIC
- Full-screen viewer with left/right arrow navigation
- Grid view and List view (with inline thumbnail)

</details>

<details>
<summary><strong>🎨 Interface</strong></summary>
<br/>

- Sleek dark design with ambient cyan glow orbs
- Animated splash screen on startup (5 s, then fade-out)
- Switchable grid / list layout
- Fully responsive (2–7 column grid adapts to screen width)
- Stagger animation on card load

</details>

---

## 🔄 Reload Behaviour – Browser Differences

Lumoravision uses the browser's **File System Access API** to read local folders. Because browsers restrict filesystem access for security reasons, the behaviour after a page reload differs:

| Browser | Open Folder | Auto-restore after Reload |
|:---|:---:|:---:|
| **Chrome / Edge** | ✅ Native OS dialog | ✅ Fully automatic |
| **Brave** | ✅ Native OS dialog | ⚠️ One confirmation click |
| **Firefox** | ✅ Fallback picker | ❌ Manual re-open required |
| **Safari** | ✅ Fallback picker | ❌ Manual re-open required |

> [!NOTE]
> Chrome and Edge implement the full **File System Access API** including persistent permissions via `IndexedDB` + `FileSystemDirectoryHandle`. This allows Lumoravision to store the folder handle across sessions and restore it automatically — without any user interaction.
>
> Firefox and Safari only partially support this API. A fallback picker is used instead, which does not allow persistent permissions. After a reload the folder must be opened again manually. Folders that need to be reopened are highlighted in **amber** in the sidebar.
>
> **This is not a bug in Lumoravision — it is a deliberate security decision made by the browser vendors.**

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/tron4x/lumoravision.git
cd lumoravision

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/` — ready to deploy on any static host (GitHub Pages, Netlify, Vercel, etc.).

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
| Video | HTML5 Video API (native, no memory leaks) |
| GIF Export | gif.js (Web Worker, runs entirely in the browser) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── VideoCard.tsx          # Grid card with thumbnail + hover preview
│   ├── VideoListRow.tsx       # List row with thumbnail + hover preview
│   ├── VideoPlayer.tsx        # Full-screen video player
│   ├── ImageCard.tsx          # Image grid card
│   ├── ImageViewer.tsx        # Full-screen image viewer
│   ├── Sidebar.tsx            # Folder navigation
│   ├── Toolbar.tsx            # Search, sort, view toggle
│   ├── Storyboard.tsx         # Frame overview & export
│   ├── SplitscreenPlayer.tsx  # Side-by-side video comparison
│   ├── PlaylistItem.tsx       # Playlist panel item
│   ├── SplashScreen.tsx       # Animated intro
│   └── InfoModal.tsx          # About dialog
├── hooks/
│   ├── useFileSystem.ts       # Folder reading + persistence
│   ├── usePersistedFolders.ts # IndexedDB storage
│   └── useSort.ts             # Sorting logic
├── utils/
│   ├── format.ts              # File size, duration, date formatting
│   ├── gifExport.ts           # GIF export via gif.js
│   └── sceneDetection.ts      # Auto chapter detection
└── types/
    └── video.ts               # TypeScript types
```

---

## 👤 Developer

<p>
  <strong>tron4x</strong> &nbsp;·&nbsp;
  <a href="https://github.com/tron4x">github.com/tron4x</a>
</p>

---

## 📄 License

This project is licensed under the **Apache License 2.0** – see the [LICENSE](./LICENSE) file for details.
