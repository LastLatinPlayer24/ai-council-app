import type { Box, TourStep } from './tours';

export const find = (step: TourStep): HTMLElement | null => {
  if (!step.target) return null;
  // el mismo target puede existir en la versión móvil y en la de escritorio: el visible
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
  return Array.from(els).find((el) => el.getClientRects().length > 0) ?? null;
};

export const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};
