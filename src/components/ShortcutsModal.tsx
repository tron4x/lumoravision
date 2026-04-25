interface ShortcutsModalProps {
  onClose: () => void;
}

const sections = [
  {
    title: '▶️ Video Player',
    shortcuts: [
      { keys: ['Space', 'K'], action: 'Play / Pause' },
      { keys: ['←', '→'], action: 'Seek ±10 s' },
      { keys: ['J', 'L'], action: 'Seek ±10 s (YouTube style)' },
      { keys: ['Alt+←', 'Alt+→'], action: 'Previous / Next video' },
      { keys: ['↑', '↓'], action: 'Volume ±10%' },
      { keys: ['M'], action: 'Toggle mute' },
      { keys: ['R'], action: 'Toggle loop' },
      { keys: [',', '.'], action: 'Step one frame back / forward' },
      { keys: ['S'], action: 'Save screenshot (PNG)' },
      { keys: ['F'], action: 'Toggle fullscreen' },
      { keys: ['Esc'], action: 'Close player' },
    ],
  },
  {
    title: '⬛⬛ Splitscreen Player',
    shortcuts: [
      { keys: ['Space', 'K'], action: 'Play / Pause both' },
      { keys: ['←', '→'], action: 'Seek ±10 s' },
      { keys: ['S'], action: 'Toggle sync mode' },
      { keys: ['1'], action: 'Layout: Side by side' },
      { keys: ['2'], action: 'Layout: Top / Bottom' },
      { keys: ['3'], action: 'Layout: PiP left' },
      { keys: ['4'], action: 'Layout: PiP right' },
      { keys: ['Esc'], action: 'Close splitscreen' },
    ],
  },
  {
    title: '🖼️ Image Viewer',
    shortcuts: [
      { keys: ['←', '→'], action: 'Previous / Next image' },
      { keys: ['Esc'], action: 'Close viewer' },
    ],
  },
  {
    title: '🌐 Global',
    shortcuts: [
      { keys: ['?'], action: 'Show this shortcuts overlay' },
    ],
  },
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-950 border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60 z-10">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm0-3H5v-2h2v2zm0-3H5V8h2v2zm3 6H8v-2h2v2zm3 0h-2v-2h2v2zm3 0h-2v-2h2v2zm3-1h-2v-2h2v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm-3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
            </svg>
            <h2 className="text-slate-100 font-semibold text-lg">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="p-6 space-y-6">
          {sections.map(section => (
            <div key={section.title}>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.shortcuts.map(({ keys, action }) => (
                  <div key={action} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-900/60">
                    <span className="text-slate-300 text-sm">{action}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && <span className="text-slate-600 text-xs">/</span>}
                          <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-slate-300 text-xs font-mono">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-slate-800/60 text-center">
          <p className="text-slate-600 text-xs">Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono">?</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono">Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  );
}
