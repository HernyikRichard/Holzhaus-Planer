import type { Mm, Plan, RoofCovering, WallLayerKind } from '../model/types';
import { BATTEN_SECTION } from '../catalog';

// Sematikus rajzi vastagságok (mm); a tetőrétegeknek nincs vastagsága a modellben.
export const DECKING_T = 22;
export const FOIL_T = 3;
export const COVERING_T: Record<RoofCovering, number> = { tile: 40, trapezoid: 20, shingle: 10, epdm: 5 };

const FOILS = new Set<WallLayerKind>(['vaporBarrier', 'breatherMembrane']);

/** Rajzi rétegvastagság: a szigetelés a váz szélessége, a lécezés a katalógus-léc vastagsága. */
export function layerThickness(plan: Plan, l: { kind: WallLayerKind; thickness: number }): number {
  if (l.kind === 'insulation') return plan.walls.studSection.w;
  if (l.kind === 'battens') return BATTEN_SECTION.t;
  return l.thickness;
}

/** A padló teteje (= a falak talpgerendájának alja): párnafa + padló-OSB, padló nélkül a betonlemez teteje (0). */
export function floorTopZ(plan: Plan): Mm {
  return plan.floor.enabled ? plan.floor.joistSection.w + plan.floor.osbThickness : 0;
}

/**
 * A bekapcsolt fali rétegek sávjai a falra merőlegesen: q a váz külső síkjától befelé nő (a váz: 0…sw),
 * kifelé negatív. A szigetelés előtti rétegek a belső síktól befelé, az utána következők a külső síktól kifelé
 * sorakoznak a rétegrend sorrendjében; a szigetelés a váz mélységében (0…sw).
 * Nulla vastagságú réteg `FOIL_T`-vel; `foilMin` esetén a fóliák legalább `FOIL_T` vastagok.
 */
export function wallLayerStrips(plan: Plan, foilMin = false): Map<WallLayerKind, [number, number]> {
  const sw = plan.walls.studSection.w;
  const layers = plan.walls.layers;
  const insIdx = layers.findIndex(l => l.kind === 'insulation');
  const strips = new Map<WallLayerKind, [number, number]>();
  const thick = (l: { kind: WallLayerKind; thickness: number }): number => {
    const lt = layerThickness(plan, l);
    const t = lt > 0 ? lt : FOIL_T;
    return foilMin && FOILS.has(l.kind) ? Math.max(t, FOIL_T) : t;
  };
  let acc = sw;
  for (let i = insIdx - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.enabled) continue;
    const t = thick(l);
    strips.set(l.kind, [acc, acc + t]);
    acc += t;
  }
  acc = 0;
  for (let i = insIdx + 1; i < layers.length; i++) {
    const l = layers[i];
    if (!l.enabled) continue;
    const t = thick(l);
    strips.set(l.kind, [acc - t, acc]);
    acc -= t;
  }
  if (layers[insIdx]?.enabled) strips.set('insulation', [0, sw]);
  return strips;
}
