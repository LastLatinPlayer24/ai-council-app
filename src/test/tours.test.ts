import { describe, expect, it } from 'vitest';
import type { AppView } from '../types';
import { GUTTER, pendingTours, placeCard, tourSteps } from '../tour/tours';

const VIEWS: AppView[] = ['dashboard', 'council', 'agents', 'forge', 'memory', 'analytics', 'settings'];

describe('tourSteps', () => {
  it('cada pantalla tiene un recorrido con títulos y textos', () => {
    for (const id of [...VIEWS, 'welcome' as const]) {
      const steps = tourSteps(id);
      expect(steps.length, id).toBeGreaterThan(1);
      for (const s of steps) {
        expect(s.title.trim(), id).not.toBe('');
        expect(s.body.length, `${id}: ${s.title}`).toBeGreaterThan(20);
      }
    }
  });

  it('la bienvenida empieza por las claves: sin ellas los agentes no responden', () => {
    const targets = tourSteps('welcome').map((s) => s.target).filter(Boolean);
    expect(targets[0]).toBe('nav-settings');
  });
});

describe('pendingTours', () => {
  it('la bienvenida va antes del recorrido de la pantalla, una sola vez', () => {
    expect(pendingTours('council', () => false)).toEqual(['welcome', 'council']);
    expect(pendingTours('council', (id) => id === 'welcome')).toEqual(['council']);
    expect(pendingTours('council', () => true)).toEqual([]);
  });
});

describe('placeCard', () => {
  const box = (top: number, height = 60, left = 100, width = 300) => ({ top, left, width, height });

  it('en el teléfono ocupa todo el ancho abajo, o arriba si abajo taparía el elemento', () => {
    expect(placeCard(box(600), 200, 390, 844)).toEqual({ left: GUTTER, width: 390 - 2 * GUTTER, top: GUTTER });
    expect(placeCard(box(120), 200, 390, 844).top).toBe(844 - 200 - GUTTER);
    // la barra de abajo (navegación): la tarjeta sube para no taparla
    expect(placeCard(box(780, 60), 200, 390, 844).top).toBe(GUTTER);
  });

  it('en escritorio va debajo del elemento si entra, si no arriba, si no al lado', () => {
    expect(placeCard(box(100), 200, 1280, 800).top).toBe(100 + 60 + 12);
    expect(placeCard(box(600), 200, 1280, 800).top).toBe(600 - 12 - 200);
    const side = placeCard({ top: 20, left: 0, width: 256, height: 760 }, 200, 1280, 800);
    expect(side.left).toBe(256 + 12);
  });

  it('sin elemento va centrada y nunca se sale de la pantalla', () => {
    const c = placeCard(null, 200, 1280, 800);
    expect(c.left).toBe((1280 - c.width) / 2);
    for (const [vw, vh] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
      for (const top of [0, 300, vh - 40]) {
        const p = placeCard(box(top, 40, 0, vw), 220, vw, vh);
        expect(p.left).toBeGreaterThanOrEqual(GUTTER);
        expect(p.left + p.width).toBeLessThanOrEqual(vw - GUTTER);
        expect(p.top).toBeGreaterThanOrEqual(GUTTER);
      }
    }
  });
});
