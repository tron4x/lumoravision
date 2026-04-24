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
- ⚡ **Lightning-fast thumbnails** – generated directly in the browser and cached in memory
- 👁️ **Hover preview** – videos start playing automatically on hover, no click needed
- ⌨️ **Keyboard-first** – all major actions accessible via shortcuts
- 🔍 **Instant search** – filters videos and images in real time as you type
- 💾 **Persistent folders** – automatically restored on next launch *(browser-dependent, see below)*

---

## ✨ Features

<details>
<summary><strong>📁 File Management</strong></summary>

- Open local folders via the native OS dialog
- Manage multiple folders simultaneously (sidebar)
- Rescan a folder to pick up newly added files
- Sort by name, date, file size or video duration
- Real-time search across all files

</details>

<details>
<summary><strong>🎬 Video Player</strong></summary>

- Supported formats: MP4, MOV, WebM, MKV, AVI, OGV, M4V, WMV, FLV, 3GP, TS and more
- Full-screen player with prev/next navigation
- Playback speed control: 0.25× to 2×
- Loop mode
- Volume control and mute
- **Auto chapter detection** – scene analysis runs entirely in the browser
- Chapter strip with thumbnails and timestamps
- **Frame-accurate navigation** – step forward/backward one frame at a time
- **Screenshot mode** – pick any frame and save it as PNG
- **GIF export** – choose time range, FPS and width, exported directly in the browser
- **Storyboard view** – visual overview of all frames with preview and single-frame export
- **Splitscreen player** – compare two videos side by side
- **Playlist** – build and play a custom queue

</details>

<details>
<summary><strong>🖼️ Image Viewer</strong></summary>

- Supported formats: JPG, PNG, GIF, WebP, AVIF, BMP, TIFF, SVG, HEIC
- Full-screen viewer with arrow navigation
- Grid and list view

</details>

<details>
<summary><strong>🎨 Interface</strong></summary>

- Sleek dark design with ambient glow effects
- Switchable grid and list layout
- Animated splash screen on startup
- Fully responsive

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
> Firefox and Safari only partially support this API. A fallback picker is used instead, which does not allow persistent permissions. After a reload the folder must be opened again manually.
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
| Thumbnails | HTML5 Canvas API |
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
