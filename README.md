# 🎬 Lumoravision

**Lumoravision** is a fast, modern media player that runs entirely in your browser – no installation, no server, no cloud. Just open a folder and start watching.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

---

## ⚡ Fast & User-Friendly

Lumoravision is built to be ready instantly:

- **No upload, no server** – your files never leave your computer
- **Lightning-fast thumbnails** – generated directly in the browser and cached in memory
- **Hover preview** – videos start playing automatically when you hover over them, no click needed
- **Keyboard-first** – all major actions are accessible via keyboard shortcuts
- **Instant search** – filters videos and images in real time as you type
- **Persistent folders** – recently opened folders are saved and automatically restored on next launch (browser-dependent, see below)

---

## ✨ Features

### 📁 File Management
- Open local folders via the native OS dialog
- Manage multiple folders simultaneously (sidebar)
- Rescan a folder to pick up newly added files
- Sort by name, date, file size or video duration
- Real-time search across all files

### 🎬 Video
- Supported formats: MP4, MOV, WebM, MKV, AVI, OGV, M4V, WMV, FLV, 3GP, TS and more
- Full-screen player with prev/next navigation
- Playback speed control: 0.25× to 2×
- Loop mode
- Volume control and mute
- Auto chapter detection (scene analysis runs entirely in the browser)
- Chapter strip with thumbnails and timestamps
- Frame-accurate navigation (step forward/backward one frame at a time)
- Screenshot mode: pick any frame and save it as PNG
- GIF export: choose time range, FPS and width – exported directly in the browser
- Storyboard view: visual overview of all frames with preview and single-frame export
- Splitscreen player: compare two videos side by side
- Playlist: build and play a custom queue

### 🖼️ Images
- Supported formats: JPG, PNG, GIF, WebP, AVIF, BMP, TIFF, SVG, HEIC
- Full-screen viewer with arrow navigation
- Grid and list view

### 🎨 Interface
- Sleek dark design with ambient glow effects
- Switchable grid and list layout
- Animated splash screen on startup
- Fully responsive

---

## 🔄 Reload Behaviour – Browser Differences

Lumoravision uses the browser's **File System Access API** to read local folders. Because browsers restrict filesystem access for security reasons, the behaviour after a page reload differs depending on which browser you use:

| Browser | Open Folder | Auto-restore after Reload |
|---|---|---|
| **Chrome / Edge** | ✅ Native OS dialog | ✅ Fully automatic – folders are restored immediately |
| **Brave** | ✅ Native OS dialog | ⚠️ One confirmation click required (security prompt) |
| **Firefox** | ✅ Fallback picker | ⚠️ Folder must be re-opened manually after reload |
| **Safari** | ✅ Fallback picker | ⚠️ Folder must be re-opened manually after reload |

> **Why the difference?**
>
> Chrome and Edge implement the full **File System Access API** including persistent permissions (`IndexedDB` + `FileSystemDirectoryHandle`). This allows Lumoravision to store the folder handle across sessions and reuse it automatically on the next launch – without any user interaction.
>
> Firefox and Safari only partially support this API or not at all. A simple fallback picker is used instead, which does not allow persistent permissions. After a reload the folder must be opened again manually.
>
> **This is not a limitation of Lumoravision – it is a deliberate security design decision made by the browser vendors.**

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🏗️ Build

```bash
npm run build
```

The production build is output to `dist/` and can be deployed to any static hosting service (GitHub Pages, Netlify, Vercel, etc.).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 |
| Styling | Tailwind CSS 4 |
| Build tool | Vite 8 |
| Persistence | IndexedDB + File System Access API |
| Thumbnails | HTML5 Canvas API |
| Video | HTML5 Video API (native, no memory leaks) |
| GIF Export | gif.js (Web Worker, runs entirely in the browser) |

---

## 👤 Developer

**tron4x** · [github.com/tron4x/lumoravision](https://github.com/tron4x/lumoravision)

---

## 📄 License

Apache 2.0 – see [LICENSE](./LICENSE) for details.
