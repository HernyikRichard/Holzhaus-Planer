import type { TimberPiece } from '../calc/types';
import type { Element } from './types';

/** Faanyag-darablista az elemekből (csak `section` + `pieceLabel` elemek). */
export function elementsToPieces(elements: Element[]): TimberPiece[] {
  const out: TimberPiece[] = [];
  for (const e of elements) {
    if (!e.section || !e.pieceLabel) continue;
    out.push({ id: e.id, category: e.category, section: e.section, length: e.length, label: e.pieceLabel });
  }
  return out;
}
