import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
//
// Bundle strategy
// ───────────────
// Without manual hints, Vite throws everything into one big chunk and warns
// once it crosses 500 kB. Lumoravision's biggest contributors are:
//   • react / react-dom              → vendored separately, cached by browsers
//   • gif.js (used only by GIF/Editor exports)
//   • the heavy modal-only components (DirectorMode, ColorGradePanel,
//     Storyboard, Slideshow, SplitscreenPlayer, HighlightsModal,
//     EasterEgg, LockScreen, ImageViewer)
//
// We do two things to keep chunks small:
//   1. `manualChunks` below pulls react & gif.js into their own files so the
//      core app stays lean and these deps get cached for free across builds
//      that don't touch them.
//   2. The modal components are loaded via `React.lazy` in App.tsx — Vite
//      automatically code-splits on `import()` boundaries, so each modal
//      lands in its own chunk that only downloads when the user opens it.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Slightly raise the warning threshold for the rare case the main
    // chunk legitimately needs more room — but with the splits below the
    // main chunk should be ~250 kB so we still want to hear about it if
    // it grows much past that.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Newer Vite (8) / Rolldown only accept the function form of
        // manualChunks; the object form was removed. We split out two
        // long-lived heavy deps so the rest of the app caches well.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'react';
            }
            if (id.includes('/gif.js/')) return 'gifjs';
          }
          return undefined;
        },
      },
    },
  },
})
