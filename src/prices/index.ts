import type { PriceList } from './types';
import raw from './kaplar.json';

const KINDS = ['timber', 'osb', 'insulation', 'foil', 'cladding', 'roofing', 'gutter', 'fastener', 'other'];

/** Minimális alakellenőrzés: a beépített JSON hibás/hiányos alakja esetén null. */
function validate(x: unknown): PriceList | null {
  const l = x as PriceList | null;
  if (!l || typeof l !== 'object' || l.source !== 'Káplár Fatelep' || typeof l.fetchedAt !== 'string') return null;
  if (!l.shipping || typeof l.shipping.fee !== 'number' || typeof l.shipping.freeAbove !== 'number') return null;
  if (!Array.isArray(l.products)) return null;
  const ok = l.products.every((p) =>
    p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.url === 'string'
    && KINDS.includes(p.kind) && typeof p.price === 'number' && p.price > 0);
  return ok ? l : null;
}

export const BUNDLED_PRICE_LIST: PriceList | null = validate(raw);
