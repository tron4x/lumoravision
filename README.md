# 🎬 Lumoravision

A fast, modern browser-based video & image gallery with a dark UI — built with React, TypeScript and Tailwind CSS.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

## ✨ Features

- **Multi-format video support** – MP4, MOV, WebM, MKV, AVI, OGV, M4V, WMV, FLV, 3GP, TS and more
- **Image support** – JPG, PNG, GIF, WebP, AVIF, BMP, TIFF, SVG, HEIC
- **Folder browser** – open local folders via native OS dialog (no upload, no server)
- **Auto-generated thumbnails** – canvas-based, lazy-loaded, cached in memory
- **Hover preview** – videos play inline on hover
- **Grid & List view** – toggle between layouts
- **Sorting** – by name, date or file size
- **Search** – filter videos and images in real time
- **Playlist** – build and play a custom queue
- **Full-screen player** – with prev/next navigation, keyboard shortcuts
- **Image viewer** – full-screen with arrow navigation
- **Persistent folders** – remembered across sessions via IndexedDB (Chrome/Edge)
- **Dark mode** – sleek dark UI with ambient glow effects
- **Zero backend** – runs entirely in the browser, no server required

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🏗️ Build

```bash
npm run build
```

Output goes to `dist/` — ready to deploy on any static host (GitHub Pages, Netlify, Vercel, etc.).

## 🌐 Browser Compatibility

| Browser | Folder Picker | Auto-restore on reload |
|---|---|---|
| Chrome / Edge | ✅ Native dialog | ✅ Automatic |
| Brave | ✅ Native dialog | ⚠️ Requires one click |
| Firefox | ✅ Fallback picker | ⚠️ Requires re-open |
| Safari | ✅ Fallback picker | ⚠️ Requires re-open |

> **Note:** Due to browser security restrictions, automatic folder access on reload is only fully supported in Chrome and Edge. This is a browser limitation, not a bug.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 |
| Styling | Tailwind CSS 4 |
| Build tool | Vite 8 |
| Persistence | IndexedDB (File System Access API) |
| Thumbnails | HTML5 Canvas API |
| Video | HTML5 Video API (native, no memory leaks) |

## 📁 Project Structure

```
src/
├── components/
│   ├── VideoCard.tsx       # Grid card with thumbnail + hover preview
│   ├── VideoListRow.tsx    # List row with thumbnail + hover preview
│   ├── VideoPlayer.tsx     # Full-screen video player
│   ├── ImageCard.tsx       # Image grid card
│   ├── ImageViewer.tsx     # Full-screen image viewer
│   ├── Sidebar.tsx         # Folder navigation
│   ├── Toolbar.tsx         # Search, sort, view toggle
│   ├── SplashScreen.tsx    # Animated intro
│   └── InfoModal.tsx       # App info
├── hooks/
│   ├── useFileSystem.ts    # Folder reading + persistence
│   ├── usePersistedFolders.ts  # IndexedDB storage
│   └── useSort.ts          # Sorting logic
├── types/
│   └── video.ts            # TypeScript types
└── utils/
    └── format.ts           # File size, duration, date formatting
```

## 📄 License

MIT
