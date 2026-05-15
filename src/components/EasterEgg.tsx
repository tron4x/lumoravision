import { useEffect, useRef, useState } from 'react';

interface EasterEggProps {
  onClose: () => void;
}

/**
 * EasterEgg
 * ─────────
 * Triggered by typing the secret word ("tron4x") anywhere in the app.
 *
 * Show:
 *   • A gently floating, glowing Lumoravision logo (no rotation — stays upright)
 *   • A starfield drifting behind it (canvas-based, ~140 stars)
 *   • Auto-scrolling movie-style credits underneath
 *
 * Performance notes:
 *   • The starfield runs in a single rAF loop. We pause it on visibility
 *     change and clean it up on unmount, so closing the egg = 0 % CPU.
 *   • The logo's float animation is pure CSS (no JS), so the GPU handles it.
 *   • The credits scroll is also pure CSS (`@keyframes`) on a transformed
 *     element, so we don't pay for layout work.
 *
 * Closing:
 *   • Click anywhere, press Esc, or wait for the credits to finish.
 */
export function EasterEgg({ onClose }: EasterEggProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const maskRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  // phase = 'credits' → starfield + floating logo + scrolling credits
  //         'outro'   → tagline/credits fade, the logo bursts into ~120
  //                     particles that fly outward through the starfield,
  //                     then onClose() reveals the app again.
  const [phase, setPhase] = useState<'credits' | 'outro'>('credits');

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Outro trigger ─────────────────────────────────────────────────────
  // We poll the position of the "✦ fin ✦" element relative to the credits
  // mask each animation frame. As soon as the bottom of "fin" passes the
  // top edge of the mask (= it's fully scrolled out the top), we switch
  // into the outro phase. This is more reliable than `onAnimationEnd` on
  // the CSS keyframe (which some browsers swallow when the tab is in the
  // background or when child animations bubble events).
  //
  // We also keep a hard timeout as a safety net in case the polling never
  // lines up (e.g. if the layout is so weird that fin never crosses the
  // edge), so the egg always self-dismisses.
  useEffect(() => {
    if (phase !== 'credits') return;

    let rafId: number | null = null;
    const tick = () => {
      const fin = finRef.current;
      const mask = maskRef.current;
      if (fin && mask) {
        const finRect = fin.getBoundingClientRect();
        const maskRect = mask.getBoundingClientRect();
        // Once fin has completely scrolled past the top of the mask,
        // its bottom edge is above the mask's top edge.
        if (finRect.bottom <= maskRect.top + 4) {
          setPhase('outro');
          return; // stop polling — phase change unmounts this effect
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Hard fallback: if we somehow never see fin scroll out (e.g. browser
    // dropped the animation), still trigger the outro.
    const t = setTimeout(() => setPhase(p => p === 'credits' ? 'outro' : p), 45_000);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearTimeout(t);
    };
  }, [phase]);

  // ── Starfield + outro particles (single rAF loop on the canvas) ───────
  // The same canvas paints both the calm cyan/purple starfield (always) and
  // the burst of explosion particles spawned in the outro phase. Sharing
  // one rAF + one canvas keeps GPU/CPU work tiny.
  //
  // We expose a `spawnExplosion` function via ref so the outro effect (in
  // a separate useEffect, below) can trigger the burst without restarting
  // the loop. The function takes the screen-space centre (cx, cy) of the
  // logo and creates ~140 particles flying radially outward.
  const spawnExplosionRef = useRef<((cx: number, cy: number) => void) | null>(null);
  const particlesAliveRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number | null = null;
    let running = true;

    type Star = { x: number; y: number; z: number; r: number; speed: number; hue: number };
    type Particle = {
      x: number; y: number;       // current position
      vx: number; vy: number;     // velocity
      r: number;                  // radius
      hue: number;
      life: number;               // 0..1, decays toward 0
      decay: number;              // per-frame decay rate
    };

    const stars: Star[] = [];
    const particles: Particle[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Spawn stars across a wide depth range so they twinkle at different rates
    const STAR_COUNT = 140;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.clientWidth,
        y: Math.random() * canvas.clientHeight,
        z: Math.random() * 0.8 + 0.2,
        r: Math.random() * 1.2 + 0.3,
        speed: Math.random() * 0.4 + 0.1,
        hue: Math.random() < 0.5 ? 190 + Math.random() * 20 : 270 + Math.random() * 30,
      });
    }

    // Make spawnExplosion available to the React layer
    spawnExplosionRef.current = (cx, cy) => {
      const PARTICLE_COUNT = 180;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Random angle around the full circle, with a slight bias to give
        // a more organic burst than a perfect ring. Speed varies per
        // particle so the cloud has depth.
        const angle = Math.random() * Math.PI * 2;
        // Wider speed range so some particles fly far out, others linger.
        const speed = 3 + Math.random() * 11;          // px / frame
        const hue = Math.random() < 0.55
          ? 185 + Math.random() * 25                   // cyans
          : 265 + Math.random() * 40;                  // purples
        particles.push({
          x: cx + (Math.random() - 0.5) * 30,          // tiny start jitter
          y: cy + (Math.random() - 0.5) * 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 1.2 + Math.random() * 2.4,
          hue,
          life: 1,
          // ~1.0 → 0 in ~330–660 frames (≈ 5.5–11 s @ 60 fps). Wide
          // spread so the swarm thins out gradually rather than dying
          // off in a single beat.
          decay: 0.0015 + Math.random() * 0.0015,
        });
      }
      particlesAliveRef.current = particles.length;
    };

    const draw = () => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Trail effect: faint dark fill so both stars and particles smear
      ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
      ctx.fillRect(0, 0, w, h);

      // ── Stars (always) ──────────────────────────────────────────────
      for (const s of stars) {
        s.y += s.speed * (1 + s.z);
        if (s.y > h + 4) {
          s.y = -4;
          s.x = Math.random() * w;
        }
        const alpha = 0.4 + s.z * 0.6;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, ${alpha})`;
        ctx.shadowBlur = 6 * s.z;
        ctx.shadowColor = `hsla(${s.hue}, 90%, 60%, ${alpha})`;
        ctx.arc(s.x, s.y, s.r * (0.8 + s.z), 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Explosion particles (only when alive) ───────────────────────
      // Iterate in reverse so we can splice dead ones out as we go.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        // Light gravity-ish drag so particles slow over time, more natural
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        const a = Math.max(0, Math.min(1, p.life));
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 95%, 75%, ${a})`;
        ctx.shadowBlur = 18 * a;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 65%, ${a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      particlesAliveRef.current = particles.length;

      ctx.shadowBlur = 0;
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    // Pause when the tab is hidden so we don't burn CPU in a background tab
    const onVis = () => {
      if (document.hidden) {
        running = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!running) {
        running = true;
        rafId = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      spawnExplosionRef.current = null;
    };
  }, []);

  // ── Outro: spawn particles + close after they all fade ────────────────
  // Reads the logo's screen-space centre (so the burst originates exactly
  // where the user was looking) and asks the canvas loop to spawn ~180
  // particles. Then waits long enough for them to drift far out and fade —
  // the `decay` range in spawnExplosion gives the longest-lived particles
  // ~11 s, so 9 s here lets the bulk of the swarm dissipate before we close
  // (the very longest stragglers are basically invisible by then anyway).
  useEffect(() => {
    if (phase !== 'outro') return;
    const logo = logoRef.current;
    if (logo && spawnExplosionRef.current) {
      const r = logo.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      spawnExplosionRef.current(cx, cy);
    }
    const t = setTimeout(() => onClose(), 9000);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  // Map phase → CSS class on the centerpiece. The outro class hides the
  // tagline + credits and triggers the explosion animation on the logo.
  const phaseClass = phase === 'outro' ? 'ee-phase-outro' : 'ee-phase-credits';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black overflow-hidden cursor-pointer"
      onClick={onClose}
      role="dialog"
      aria-label="Easter egg credits"
    >
      {/* Starfield background — pointer-events:none so clicks pass through */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Vignette + ambient orbs for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />
      <div className="ee-orb ee-orb-cyan" />
      <div className="ee-orb ee-orb-purple" />


      {/* Centerpiece: floating logo + credits */}
      <div className={`relative flex flex-col items-center pointer-events-none select-none ${phaseClass}`}>
        {/* Logo. In outro phase the .ee-logo-explode animation runs and we
            close the egg when it finishes. */}
        <div className="ee-logo-wrap">
          <div className="ee-logo-glow" />
          <img
            ref={logoRef}
            src="/lumoravision.png"
            alt="Lumoravision"
            className="ee-logo"
            draggable={false}
          />
        </div>

        {/* Tagline */}
        <p className="ee-tagline mt-6">
          <span className="ee-shimmer">Lumoravision</span>
        </p>
        <p className="text-slate-500 text-xs tracking-[0.4em] uppercase mt-1">
          A media tool, not a service
        </p>

        {/* Credits scroller. The mask + .ee-fin div are observed by the
            outro-trigger effect via finRef/maskRef; when fin scrolls past
            the top of the mask we switch into the outro phase. */}
        <div ref={maskRef} className="ee-credits-mask mt-10">
          <div className="ee-credits">
            <CreditBlock title="Created &amp; Designed">
              <li>tron4x</li>
            </CreditBlock>

            <CreditBlock title="Engineering">
              <li>tron4x</li>
              <li>React 19 · TypeScript 6</li>
              <li>Tailwind CSS 4 · Vite 8</li>
            </CreditBlock>

            <CreditBlock title="Browser APIs">
              <li>File System Access API</li>
              <li>HTML5 Video · Canvas · WebGL</li>
              <li>MediaRecorder · IndexedDB</li>
              <li>requestVideoFrameCallback</li>
            </CreditBlock>

            <CreditBlock title="Open Source">
              <li>gif.js · Web Workers</li>
              <li>The countless folks behind every one of these</li>
            </CreditBlock>

            <CreditBlock title="Special Thanks">
              <li>You — for opening the source instead of just running it</li>
              <li>Anyone who reports a bug instead of cursing in silence</li>
            </CreditBlock>

            <CreditBlock title="Reminder">
              <li>Your files never left your machine.</li>
              <li>Not once.</li>
            </CreditBlock>

            <div ref={finRef} className="ee-fin">✦ fin ✦</div>
          </div>
        </div>
      </div>

      {/* Bottom hint — outside the centerpiece so it sits above the credits */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <div className="text-slate-600 text-[11px] font-mono tracking-widest uppercase animate-pulse">
          Click anywhere · Esc to close
        </div>
      </div>

      {/* Inline scoped styles — defined as a const above the JSX to keep
          TypeScript's JSX parser happy with the curly braces in @keyframes. */}
      <style dangerouslySetInnerHTML={{ __html: EASTER_EGG_CSS }} />
    </div>
  );
}

// CSS for the easter egg, kept outside JSX so TypeScript treats the curly
// braces as plain string content (not JSX expressions).
const EASTER_EGG_CSS = `
        .ee-logo-wrap {
          position: relative;
          width: 200px;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ee-float 6s ease-in-out infinite;
        }
        .ee-logo {
          position: relative;
          width: 100%;
          height: 100%;
          object-fit: contain;
          z-index: 2;
          filter: drop-shadow(0 0 24px rgba(6,182,212,0.55))
                  drop-shadow(0 0 60px rgba(139,92,246,0.35));
          /* No rotation — the logo stays upright. The float animation on
             .ee-logo-wrap and the pulsing glow do the visual work. */
        }
        .ee-logo-glow {
          position: absolute;
          inset: -30%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(6,182,212,0.45) 0%, rgba(139,92,246,0.25) 35%, transparent 70%);
          filter: blur(30px);
          z-index: 1;
          animation: ee-pulse 4.5s ease-in-out infinite;
        }
        @keyframes ee-float {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-14px) }
        }
        @keyframes ee-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.08); }
        }

        .ee-tagline {
          font-size: 2.25rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1;
        }
        .ee-shimmer {
          background: linear-gradient(
            90deg,
            #06b6d4 0%,
            #67e8f9 25%,
            #a855f7 50%,
            #67e8f9 75%,
            #06b6d4 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ee-shimmer 6s linear infinite;
        }
        @keyframes ee-shimmer {
          to { background-position: -200% center; }
        }

        .ee-credits-mask {
          width: 460px;
          max-width: 90vw;
          height: 220px;
          overflow: hidden;
          position: relative;
          mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            black 18%,
            black 78%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            black 18%,
            black 78%,
            transparent 100%
          );
        }
        .ee-credits {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2.4rem;
          padding-top: 220px;
          /* Total scroll distance ≈ content height + mask height. We use
             100% of the mask height + a tall transform; the duration is
             tuned so each credit block is readable for ~3s. */
          animation: ee-scroll 38s linear forwards;
          will-change: transform;
        }
        @keyframes ee-scroll {
          from { transform: translateY(0); }
          to   { transform: translateY(-1400px); }
        }
        .ee-block {
          text-align: center;
          color: rgba(226,232,240,0.9);
        }
        .ee-block-title {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: rgba(103,232,249,0.85);
          margin-bottom: 0.5rem;
        }
        .ee-block-list {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 1rem;
          line-height: 1.7;
        }
        .ee-fin {
          font-size: 1.5rem;
          letter-spacing: 0.4em;
          color: rgba(168,85,247,0.85);
          padding: 1rem 0 4rem;
        }

        /* Soft-glow ambient orbs in the corners */
        .ee-orb {
          position: absolute;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.35;
          pointer-events: none;
        }
        .ee-orb-cyan {
          background: rgba(6,182,212,0.6);
          top: -120px; left: -120px;
          animation: ee-orb-drift-1 18s ease-in-out infinite alternate;
        }
        .ee-orb-purple {
          background: rgba(139,92,246,0.6);
          bottom: -120px; right: -120px;
          animation: ee-orb-drift-2 22s ease-in-out infinite alternate;
        }
        @keyframes ee-orb-drift-1 {
          to { transform: translate(40px, 30px) scale(1.1); }
        }
        @keyframes ee-orb-drift-2 {
          to { transform: translate(-40px, -30px) scale(1.15); }
        }

        /* ── Outro phase ────────────────────────────────────────────────
           When the credits scroll finishes, we switch to .ee-phase-outro on
           the centerpiece. The TS layer simultaneously spawns ~140 canvas
           particles at the logo's centre. The CSS just needs to:
             1. Quickly fade out the logo + glow (so the particles look like
                they ARE the logo, not separate from it).
             2. Fade out the tagline and credits a bit slower so they don't
                disappear instantly.
             3. Stop the float wrapper animation. */
        .ee-phase-outro .ee-tagline,
        .ee-phase-outro .ee-tagline + p,
        .ee-phase-outro .ee-credits-mask {
          animation: ee-fade-out 0.55s ease-out forwards;
        }
        .ee-phase-outro .ee-logo-wrap {
          animation: none;
          transform: translateY(0);
        }
        /* Logo + glow disappear in ~150 ms — fast enough that the particles
           appear to BE the logo, slow enough that you see them spawn. */
        .ee-phase-outro .ee-logo,
        .ee-phase-outro .ee-logo-glow {
          animation: ee-burst-out 0.18s ease-in forwards;
        }

        @keyframes ee-fade-out {
          to { opacity: 0; transform: translateY(8px); }
        }
        @keyframes ee-burst-out {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.15); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ee-logo, .ee-logo-wrap, .ee-logo-glow, .ee-shimmer,
          .ee-credits, .ee-orb { animation: none; }
          .ee-phase-outro .ee-logo,
          .ee-phase-outro .ee-logo-glow,
          .ee-phase-outro .ee-tagline,
          .ee-phase-outro .ee-tagline + p,
          .ee-phase-outro .ee-credits-mask {
            animation: ee-fade-out 0.4s linear forwards;
          }
        }
`;

// Small helper so the credits stay declarative. Kept inline because the
// easter egg is the only place it's used.
function CreditBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ee-block">
      <div className="ee-block-title">{title}</div>
      <ul className="ee-block-list">{children}</ul>
    </div>
  );
}
