import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<'visible' | 'fadeout'>('visible');

  useEffect(() => {
    // Show for 2s, then fade out over 0.6s
    const showTimer = setTimeout(() => setPhase('fadeout'), 2000);
    const doneTimer = setTimeout(() => onDone(), 2600);
    return () => { clearTimeout(showTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0f]"
      style={{
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: 'opacity 0.6s ease-in-out',
        pointerEvents: phase === 'fadeout' ? 'none' : 'all',
      }}
    >
      <div
        className="flex flex-col items-center gap-6"
        style={{
          opacity: phase === 'fadeout' ? 0 : 1,
          transform: phase === 'fadeout' ? 'scale(0.97)' : 'scale(1)',
          transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out',
        }}
      >
          <img
            src="/2.png"
            alt="Lumoravision"
            className="w-[600px] max-w-[90vw] max-h-[80vh] object-contain select-none"
            draggable={false}
          />
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold tracking-widest text-white" style={{ letterSpacing: '0.15em' }}>
              LUMORAVISION
            </span>
            <span className="text-xs text-slate-500 tracking-widest uppercase">Modern Media Player</span>
          </div>
      </div>
    </div>
  );
}
