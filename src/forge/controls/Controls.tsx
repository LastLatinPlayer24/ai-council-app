import { useRef, useCallback, useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════
// Forge Controls — BipolarSlider, LogSlider, PlainSlider,
//                  SegmentedRing, NeonToggle
// Todos touch-first, clampeados por diseño, con feedback neón.
// ═══════════════════════════════════════════════════════════════

// ─── Base slider hook (pointer drag sobre una pista) ─────────────
function useTrackDrag(onRatio: (r: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  const ratioFromEvent = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    setActive(true);
    onRatio(ratioFromEvent(e.clientX));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [onRatio, ratioFromEvent]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      onRatio(ratioFromEvent(e.clientX));
    };
    const onUp = () => { dragging.current = false; setActive(false); };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onRatio, ratioFromEvent]);

  return { trackRef, onPointerDown, active };
}

function snapStep(v: number, step: number, min: number, max: number) {
  const s = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, parseFloat(s.toFixed(4))));
}

// ─── PlainSlider ─────────────────────────────────────────────────
interface SliderProps {
  label: string;
  value: number;
  min: number; max: number; step: number;
  color?: string;
  unit?: string;
  desc?: string;
  onChange: (v: number) => void;
}

export function PlainSlider({ label, value, min, max, step, color = '#00f5ff', unit, desc, onChange }: SliderProps) {
  const { trackRef, onPointerDown, active } = useTrackDrag(r => {
    onChange(snapStep(min + r * (max - min), step, min, max));
  });
  const pct = ((value - min) / (max - min)) * 100;
  const display = step >= 1 ? Math.round(value) : value.toFixed(2);

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>{label}</span>
        <span className="font-orbitron font-bold" style={{ color, fontSize: 13 }}>
          {display}{unit && <span className="text-gray-600 font-mono-jetbrains ml-1" style={{ fontSize: 8 }}>{unit}</span>}
        </span>
      </div>
      <div ref={trackRef} onPointerDown={onPointerDown}
        className="relative h-8 flex items-center cursor-pointer" role="slider"
        aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}55, ${color})`,
              boxShadow: active ? `0 0 10px ${color}` : `0 0 4px ${color}66`,
              transition: active ? 'none' : 'box-shadow 0.3s',
            }} />
        </div>
        <div className="absolute w-4 h-4 rounded-full border-2 -translate-x-1/2 pointer-events-none"
          style={{
            left: `${pct}%`,
            background: '#0a1220',
            borderColor: color,
            boxShadow: active ? `0 0 12px ${color}` : `0 0 5px ${color}88`,
            transform: `translateX(-50%) scale(${active ? 1.25 : 1})`,
            transition: active ? 'none' : 'transform 0.2s, box-shadow 0.3s',
          }} />
      </div>
      {desc && <div className="text-gray-700 leading-tight" style={{ fontSize: 8 }}>{desc}</div>}
    </div>
  );
}

// ─── BipolarSlider (centro = 0, cyan hacia +, magenta hacia −) ───
export function BipolarSlider({ label, value, min, max, step, desc, onChange }: SliderProps) {
  const { trackRef, onPointerDown, active } = useTrackDrag(r => {
    onChange(snapStep(min + r * (max - min), step, min, max));
  });
  const centerPct = ((0 - min) / (max - min)) * 100;
  const valuePct = ((value - min) / (max - min)) * 100;
  const posColor = '#00f5ff';
  const negColor = '#e879f9';
  const activeColor = value >= 0 ? posColor : negColor;
  const fillLeft = Math.min(centerPct, valuePct);
  const fillWidth = Math.abs(valuePct - centerPct);

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>{label}</span>
        <span className="font-orbitron font-bold" style={{ color: activeColor, fontSize: 13 }}>
          {value > 0 ? '+' : ''}{value.toFixed(1)}
        </span>
      </div>
      <div ref={trackRef} onPointerDown={onPointerDown}
        className="relative h-8 flex items-center cursor-pointer" role="slider"
        aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
        <div className="w-full h-1.5 rounded-full bg-white/5 relative overflow-hidden">
          <div className="absolute h-full rounded-full"
            style={{
              left: `${fillLeft}%`, width: `${fillWidth}%`,
              background: activeColor,
              boxShadow: active ? `0 0 10px ${activeColor}` : 'none',
              opacity: 0.85,
            }} />
        </div>
        {/* Center notch */}
        <div className="absolute w-px h-4 bg-white/30 pointer-events-none" style={{ left: `${centerPct}%` }} />
        <div className="absolute w-4 h-4 rounded-full border-2 pointer-events-none"
          style={{
            left: `${valuePct}%`,
            background: '#0a1220',
            borderColor: activeColor,
            boxShadow: `0 0 ${active ? 12 : 5}px ${activeColor}`,
            transform: `translateX(-50%) scale(${active ? 1.25 : 1})`,
            transition: active ? 'none' : 'transform 0.2s',
          }} />
      </div>
      {desc && <div className="text-gray-700 leading-tight" style={{ fontSize: 8 }}>{desc}</div>}
    </div>
  );
}

// ─── LogSlider (escala logarítmica para rangos amplios) ──────────
export function LogSlider({ label, value, min, max, step, color = '#a855f7', unit, desc, onChange }: SliderProps) {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const { trackRef, onPointerDown, active } = useTrackDrag(r => {
    const raw = Math.exp(logMin + r * (logMax - logMin));
    onChange(snapStep(raw, step, min, max));
  });
  const pct = ((Math.log(value) - logMin) / (logMax - logMin)) * 100;

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>{label}</span>
        <span className="font-orbitron font-bold" style={{ color, fontSize: 13 }}>
          {value >= 1000 ? `${(value / 1024).toFixed(1)}k` : Math.round(value)}
          {unit && <span className="text-gray-600 font-mono-jetbrains ml-1" style={{ fontSize: 8 }}>{unit}</span>}
        </span>
      </div>
      <div ref={trackRef} onPointerDown={onPointerDown}
        className="relative h-8 flex items-center cursor-pointer" role="slider"
        aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}55, ${color})`,
              boxShadow: active ? `0 0 10px ${color}` : `0 0 4px ${color}66`,
            }} />
        </div>
        {/* Log scale marks */}
        {[128, 512, 2048].map(mark => {
          const mPct = ((Math.log(mark) - logMin) / (logMax - logMin)) * 100;
          return <div key={mark} className="absolute w-px h-2.5 bg-white/15 pointer-events-none" style={{ left: `${mPct}%` }} />;
        })}
        <div className="absolute w-4 h-4 rounded-full border-2 pointer-events-none"
          style={{
            left: `${pct}%`, background: '#0a1220', borderColor: color,
            boxShadow: `0 0 ${active ? 12 : 5}px ${color}`,
            transform: `translateX(-50%) scale(${active ? 1.25 : 1})`,
            transition: active ? 'none' : 'transform 0.2s',
          }} />
      </div>
      {desc && <div className="text-gray-700 leading-tight" style={{ fontSize: 8 }}>{desc}</div>}
    </div>
  );
}

// ─── SegmentedRing (niveles discretos con nombres) ───────────────
interface RingProps {
  label: string;
  icon?: string;
  levels: string[];       // nombres de nivel
  value: number;          // índice actual
  color?: string;
  onChange: (idx: number) => void;
}

export function SegmentedRing({ label, icon, levels, value, color = '#00f5ff', onChange }: RingProps) {
  const size = 96;
  const r = size / 2;
  const trackR = r - 7;
  const arcSpan = 270;
  const startA = -135;
  const gap = 5; // grados entre segmentos
  const segSpan = (arcSpan - gap * (levels.length - 1)) / levels.length;

  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: r + radius * Math.cos(rad), y: r + radius * Math.sin(rad) };
  };
  const arcPath = (from: number, to: number) => {
    const s = polar(from, trackR);
    const e = polar(to, trackR);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${trackR} ${trackR} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {levels.map((_, i) => {
            const from = startA + i * (segSpan + gap);
            const to = from + segSpan;
            const isActive = i === value;
            const isPast = i < value;
            return (
              <path key={i} d={arcPath(from, to)}
                stroke={isActive ? color : isPast ? color + '66' : 'rgba(255,255,255,0.08)'}
                strokeWidth={isActive ? 6 : 4}
                fill="none" strokeLinecap="round"
                className="cursor-pointer"
                style={{
                  filter: isActive ? `drop-shadow(0 0 6px ${color})` : 'none',
                  transition: 'stroke 0.2s, stroke-width 0.2s',
                }}
                onClick={() => onChange(i)} />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
          <span className="font-mono-jetbrains font-bold tracking-wider text-center leading-tight px-2"
            style={{ color, fontSize: 8 }}>
            {levels[value]}
          </span>
        </div>
      </div>
      <span className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>{label}</span>
      {/* Botones < > para accesibilidad + taps rápidos */}
      <div className="flex gap-2">
        <button onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="w-7 h-7 rounded border border-white/10 text-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90 transition-transform"
          style={{ WebkitTapHighlightColor: 'transparent' }} aria-label={`${label} anterior`}>
          ‹
        </button>
        <button onClick={() => onChange(Math.min(levels.length - 1, value + 1))}
          disabled={value === levels.length - 1}
          className="w-7 h-7 rounded border border-white/10 text-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90 transition-transform"
          style={{ WebkitTapHighlightColor: 'transparent' }} aria-label={`${label} siguiente`}>
          ›
        </button>
      </div>
    </div>
  );
}

// ─── NeonToggle ──────────────────────────────────────────────────
interface ToggleProps {
  label: string;
  desc?: string;
  icon?: string;
  checked: boolean;
  color?: string;
  onChange: (v: boolean) => void;
}

export function NeonToggle({ label, desc, icon, checked, color = '#00ff9d', onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 p-3 rounded-lg border transition-all active:scale-98 text-left"
      style={{
        borderColor: checked ? color + '44' : 'rgba(255,255,255,0.08)',
        background: checked ? color + '0a' : 'rgba(255,255,255,0.02)',
        WebkitTapHighlightColor: 'transparent',
      }}
      role="switch" aria-checked={checked} aria-label={label}
    >
      {icon && <span className="text-lg flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="font-mono-jetbrains tracking-wider" style={{ fontSize: 10, color: checked ? color : '#6b7280' }}>
          {label}
        </div>
        {desc && <div className="text-gray-600 leading-tight mt-0.5" style={{ fontSize: 8 }}>{desc}</div>}
      </div>
      {/* Switch pill */}
      <div className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200"
        style={{ background: checked ? color + '33' : 'rgba(255,255,255,0.08)', border: `1px solid ${checked ? color + '66' : 'rgba(255,255,255,0.1)'}` }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200"
          style={{
            left: checked ? 'calc(100% - 22px)' : '2px',
            background: checked ? color : '#4b5563',
            boxShadow: checked ? `0 0 8px ${color}` : 'none',
          }} />
      </div>
    </button>
  );
}
