import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { boxOf, find } from './dom';
import { type Box, placeCard, type TourStep } from './tours';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function HelpButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" data-tour="help" onClick={onClick} aria-label="Ver el tutorial de esta pantalla"
      title="Tutorial" className={`tour-help ${className}`}>
      ?
    </button>
  );
}

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(200);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    const el = find(step);
    setBox(el ? boxOf(el) : null);
    setView({ w: window.innerWidth, h: window.innerHeight });
  }, [step]);

  // al cambiar de paso: lleva el elemento a la vista (dentro de su panel con scroll) y mide
  useLayoutEffect(() => {
    find(step)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [step, measure]);

  useEffect(() => {
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // en captura: los paneles de la app tienen su propio scroll, no la ventana
    document.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
    };
  }, [measure]);

  // la altura real de la tarjeta decide si cabe debajo o arriba del elemento
  useEffect(() => {
    const el = card.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // foco en la tarjeta mientras está abierta y de vuelta donde estaba al cerrar
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [i]);

  const next = () => (last ? onClose() : setI(i + 1));
  const prev = () => setI(Math.max(0, i - 1));

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowRight') {
      next();
    } else if (e.key === 'ArrowLeft') {
      prev();
    } else if (e.key === 'Tab' && card.current) {
      const items = card.current.querySelectorAll<HTMLElement>('button');
      const first = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const pos = placeCard(box, cardH, view.w, view.h);
  const pad = 6;
  // el resaltado no se sale de la pantalla (p. ej. la barra de navegación de abajo en el teléfono)
  const spot = box && (() => {
    const left = Math.max(2, box.left - pad);
    const top = Math.max(2, box.top - pad);
    const right = Math.min(view.w - 2, box.left + box.width + pad);
    const bottom = Math.min(view.h - 2, box.top + box.height + pad);
    return { top, left, width: right - left, height: bottom - top };
  })();

  return (
    <div className="tour" onKeyDown={onKey}>
      <div className="tour-catch" onClick={(e) => e.stopPropagation()} />
      {spot ? (
        <div className="tour-spot" aria-hidden style={spot} />
      ) : <div className="tour-dim" aria-hidden />}
      <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <p className="tour-count">Paso {i + 1} de {steps.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {steps.map((_, n) => <span key={n} className={n === i ? 'on' : ''} />)}
        </div>
        <div className="tour-actions">
          {!last && <button type="button" className="tour-btn ghost" onClick={onClose}>Saltar</button>}
          <span className="spacer" />
          {i > 0 && <button type="button" className="tour-btn" onClick={prev}>Anterior</button>}
          <button ref={primary} type="button" className="tour-btn primary" onClick={next}>
            {last ? 'Entendido' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
