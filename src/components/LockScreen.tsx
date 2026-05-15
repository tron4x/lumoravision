import { useState, useEffect, useRef } from 'react';

interface LockScreenProps {
  onUnlock: () => void;
}

const UNLOCK_CODE = 'unlock';
const MAX_ATTEMPTS = 3;
const LOCK_STORAGE_KEY = 'lumoravision_permanent_lock';

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [inputCode, setInputCode] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(() => {
    const stored = localStorage.getItem(LOCK_STORAGE_KEY + '_attempts');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [permanentlyLocked, setPermanentlyLocked] = useState(() => {
    return localStorage.getItem(LOCK_STORAGE_KEY) === 'true';
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Save lock state to localStorage
  useEffect(() => {
    if (permanentlyLocked) {
      localStorage.setItem(LOCK_STORAGE_KEY, 'true');
    }
  }, [permanentlyLocked]);

  // Save attempts to localStorage
  useEffect(() => {
    localStorage.setItem(LOCK_STORAGE_KEY + '_attempts', attempts.toString());
  }, [attempts]);

  useEffect(() => {
    if (!permanentlyLocked) {
      inputRef.current?.focus();
    }
  }, [permanentlyLocked]);

  useEffect(() => {
    if (!permanentlyLocked && inputCode.toLowerCase() === UNLOCK_CODE) {
      onUnlock();
    }
  }, [inputCode, onUnlock, permanentlyLocked]);

  // Block all keyboard shortcuts when permanently locked
  useEffect(() => {
    if (permanentlyLocked) {
      const blockAll = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      window.addEventListener('keydown', blockAll, true);
      window.addEventListener('keyup', blockAll, true);
      window.addEventListener('keypress', blockAll, true);
      return () => {
        window.removeEventListener('keydown', blockAll, true);
        window.removeEventListener('keyup', blockAll, true);
        window.removeEventListener('keypress', blockAll, true);
      };
    }
  }, [permanentlyLocked]);

  // Block context menu and dev tools
  useEffect(() => {
    if (permanentlyLocked) {
      const blockContext = (e: MouseEvent) => {
        e.preventDefault();
        return false;
      };
      document.addEventListener('contextmenu', blockContext, true);
      return () => document.removeEventListener('contextmenu', blockContext, true);
    }
  }, [permanentlyLocked]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (permanentlyLocked) return;
    
    if (inputCode.toLowerCase() === UNLOCK_CODE) {
      onUnlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setShake(true);
      setInputCode('');
      setTimeout(() => setShake(false), 500);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        setPermanentlyLocked(true);
      }
    }
  };

  if (permanentlyLocked) {
    return (
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Full screen stop image */}
        <img
          src="lumoravision.png"
          alt="Access Denied"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        
        {/* Overlay with text */}
        <div className="relative flex flex-col items-center gap-6 text-center z-10">
          <h1 className="text-5xl font-bold text-white tracking-tight drop-shadow-2xl">
            ACCESS DENIED
          </h1>
          <p className="text-white/80 text-lg drop-shadow-lg">
            Maximum authentication attempts exceeded
          </p>
          <div className="flex items-center gap-2 text-white">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-mono uppercase tracking-wider drop-shadow-lg">Security Lockdown Active</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}
      />

      <div className="relative flex flex-col items-center gap-8 p-12 max-w-md w-full mx-4">
        {/* Lock Icon with glow */}
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/30 rounded-full blur-2xl animate-pulse" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border border-red-500/30 shadow-2xl shadow-red-500/20">
            <svg className="w-14 h-14 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Session Locked
          </h1>
          <p className="text-slate-500 text-sm">
            This application has been secured
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className={`relative ${shake ? 'animate-shake' : ''}`}>
            <div className="absolute inset-0 bg-red-500/20 rounded-xl blur-xl opacity-50" />
            <input
              ref={inputRef}
              type="password"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Enter access code"
              className="relative w-full px-5 py-4 bg-slate-800/80 text-white placeholder-slate-500 text-center text-lg rounded-xl border border-slate-700/50 focus:border-red-500/50 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all backdrop-blur-sm"
              autoComplete="off"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-red-500/25 active:scale-[0.98]"
          >
            Unlock
          </button>
        </form>

        {/* Attempts counter with warning */}
        {attempts > 0 && (
          <div className="text-center space-y-1">
            <p className="text-red-400/70 text-xs font-mono">
              {attempts} of {MAX_ATTEMPTS} attempts used
            </p>
            {attempts === MAX_ATTEMPTS - 1 && (
              <p className="text-red-500 text-xs font-bold animate-pulse">
                ⚠️ WARNING: Last attempt remaining!
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-slate-700 text-xs font-mono tracking-wider">
            LUMORAVISION SECURITY
          </p>
        </div>
      </div>

      {/* Add shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
