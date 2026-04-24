interface InfoModalProps {
  onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-slate-950 rounded-2xl border border-slate-800/60 shadow-2xl shadow-black/60 overflow-hidden max-w-lg w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" title="Close (Esc)" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <span className="flex-1 text-center text-sm font-semibold text-slate-300 tracking-wide">About Lumoravision</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors flex-none">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* GIF */}
        <div className="bg-black flex items-center justify-center p-4">
          <img
            src="/2.gif"
            alt="Lumoravision"
            className="max-w-full max-h-[60vh] object-contain rounded-lg"
            draggable={false}
          />
        </div>

        {/* Info text */}
        <div className="px-6 py-4 flex flex-col items-center gap-2 border-t border-slate-800/60">
          <span className="text-lg font-bold tracking-widest text-white uppercase" style={{ letterSpacing: '0.15em' }}>Lumoravision</span>
          <span className="text-xs text-slate-500 tracking-widest uppercase">Modern Media Player</span>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
            <span>Videos · Images · Screenshots</span>
          </div>
          <button
            onClick={onClose}
            className="mt-3 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
