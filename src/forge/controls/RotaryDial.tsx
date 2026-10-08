import { useRef, useCallback, useEffect, useState } from 'react';

// ═══════════════════════════════════════════════════════════════
// RotaryDial — perilla giratoria estilo sintetizador
// · Gira arrastrando en arco (pointer events: touch + mouse)
// · Arco de progreso neón + tick marks que se iluminan
// · Doble tap = reset al default
// · Valores clampeados por diseño: imposible salir de rango
// ═══════════════════════════════════════════════════════════════

interface RotaryDialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  color?: string;
  size?: number;
  unit?: string;
  desc?: string;
  onChange: (v: number) => void;
}

const START_ANGLE = -135; // grados — inicio del arco
const END_ANGLE = 135;    // fin del arco (270° de recorrido)

function valueToAngle(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return START_ANGLE + t * (END_ANGLE - START_ANGLE);
}

function snap(value: number, step: number, min: number, max: number): number {
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(4))));
}

export function RotaryDial({
  label, value, min, max, step, defaultValue,
  color = '#00f5ff', size = 110, unit, desc, onChange,
}: RotaryDialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastAngle = useRef(0);
  const accum = useRef(value);
  const lastTap = useRef(0);
  const [active, setActive] = useState(false);

  const angle = valueToAngle(value, min, max);

  const getPointerAngle = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    // Doble tap → reset
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onChange(defaultValue);
      accum.current = defaultValue;
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    dragging.current = true;
    setActive(true);
    lastAngle.current = getPointerAngle(e);
    accum.current = value;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [value, defaultValue, onChange, getPointerAngle]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      const a = getPointerAngle(e);
      let delta = a - lastAngle.current;
      // wrap-around: cruzar de 179° a -179°
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      lastAngle.current = a;

      const range = max - min;
      accum.current += (delta / (END_ANGLE - START_ANGLE)) * range;
      accum.current = Math.min(max, Math.max(min, accum.current));
      const snapped = snap(accum.current, step, min, max);
      onChange(snapped);
    };
    const onUp = () => {
      dragging.current = false;
      setActive(false);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [min, max, step, onChange, getPointerAngle]);

  // ── SVG geometry ──
  const r = size / 2;
  const trackR = r - 8;
  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: r + radius * Math.cos(rad), y: r + radius * Math.sin(rad) };
  };
  const arcPath = (from: number, to: number, radius: number) => {
    const s = polar(from, radius);
    const e2 = polar(to, radius);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e2.x} ${e2.y}`;
  };

  // Tick marks (13 ticks a lo largo del arco)
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const tickAngle = START_ANGLE + (i / 12) * (END_ANGLE - START_ANGLE);
    const lit = tickAngle <= angle + 0.01;
    const outer = polar(tickAngle, trackR + 5);
    const inner = polar(tickAngle, trackR - 1);
    return { outer, inner, lit, key: i };
  });

  const knobPos = polar(angle, trackR - 12);
  const displayValue = step >= 1 ? Math.round(value).toString() : value.toFixed(2);

  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ touchAction: 'none' }}>
      <div
        ref={dialRef}
        onPointerDown={onPointerDown}
        className="relative cursor-grab active:cursor-grabbing"
        style={{ width: size, height: size }}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(snap(value + step, step, min, max));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(snap(value - step, step, min, max));
        }}
      >
        <svg width={size} height={size} className="absolute inset-0">
          {/* Track base */}
          <path d={arcPath(START_ANGLE, END_ANGLE, trackR)}
            stroke="rgba(255,255,255,0.06)" strokeWidth={4} fill="none" strokeLinecap="round" />
          {/* Progress arc */}
          <path d={arcPath(START_ANGLE, angle, trackR)}
            stroke={color} strokeWidth={4} fill="none" strokeLinecap="round"
            style={{
              filter: active ? `drop-shadow(0 0 8px ${color})` : `drop-shadow(0 0 3px ${color}88)`,
              transition: active ? 'none' : 'filter 0.3s',
            }} />
          {/* Ticks */}
          {ticks.map(t => (
            <line key={t.key} x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y}
              stroke={t.lit ? color : 'rgba(255,255,255,0.12)'}
              strokeWidth={t.lit ? 1.5 : 1}
              style={{ transition: 'stroke 0.15s' }} />
          ))}
          {/* Knob indicator */}
          <circle cx={knobPos.x} cy={knobPos.y} r={active ? 5 : 4}
            fill={color}
            style={{
              filter: `drop-shadow(0 0 ${active ? 10 : 5}px ${color})`,
              transition: 'r 0.15s',
            }} />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-orbitron font-bold leading-none"
            style={{ color, fontSize: size * 0.19, textShadow: active ? `0 0 12px ${color}` : 'none' }}>
            {displayValue}
          </span>
          {unit && (
            <span className="font-mono-jetbrains text-gray-600" style={{ fontSize: size * 0.08 }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      <div className="text-center">
        <div className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>
          {label}
        </div>
        {desc && (
          <div className="text-gray-700 max-w-[130px] leading-tight mt-0.5" style={{ fontSize: 8 }}>
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}
