import pkg from '../../package.json';

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
        className="relative flex flex-col bg-slate-950 rounded-2xl border border-slate-800/60 shadow-2xl shadow-black/60 overflow-hidden max-w-lg w-full mx-4 max-h-[90vh]"
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

        {/* Logo */}
        <div className="bg-[#0a0a0f] flex items-center justify-center p-8">
          <img
            src="/lumoravision.png"
            alt="Lumoravision"
            className="max-w-[360px] w-full object-contain select-none drop-shadow-[0_0_40px_rgba(6,182,212,0.5)]"
            draggable={false}
          />
        </div>

        {/* Info text */}
        <div className="px-6 py-5 flex flex-col items-center gap-3 border-t border-slate-800/60 overflow-y-auto">
          <span className="text-xs text-slate-500 tracking-widest uppercase">Modern Media Player</span>
          <div className="text-xs text-slate-500 font-mono">v{pkg.version}</div>
          <div className="text-xs text-slate-600">Videos · Images · Screenshots · GIF Export</div>

          <div className="w-full grid grid-cols-1 gap-2 mt-2 text-left">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Privacy</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Lumoravision runs client-side in your browser. Your videos and images are read locally and are not uploaded,
                stored on a server, tracked, or sent to a cloud service.
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">Responsible use</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Only open, edit and export media you own or are legally allowed to use. You are responsible for the files
                you process and export with this app.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 mb-1">Safety limits</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Heavy processing is intentionally limited to protect your browser: Auto-Highlights supports videos up to
                30 minutes, and graded video export records in real time.
              </p>
            </div>
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-400 mb-1">License — Non-commercial</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Lumoravision is licensed under{' '}
                <a
                  href="https://creativecommons.org/licenses/by-nc/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-300 hover:text-orange-200 underline"
                >
                  CC BY-NC 4.0
                </a>
                . Free for personal and non-commercial use with attribution. Commercial use requires a separate written
                licence from the author.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5 mt-1">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
              <span>Developer: <span className="text-slate-300 font-medium">tron4x</span></span>
            </div>
            <a
              href="https://github.com/tron4x/lumoravision"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              github.com/tron4x/lumoravision
            </a>
          </div>

          <button
            onClick={onClose}
            className="mt-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
