import type { Mm, Plan, WallSide } from '../model/types';
import { PIER_ROW_H, PLINTH_BLOCK_LEN, PLINTH_BLOCK_WIDTH } from '../catalog';
import { frameLayout } from './frame';

/** A lábazat-tengely egy oldala: tengelyvonal-szakasz világ (x, y) koordinátákban, sarokponttól sarokpontig. */
export interface StripSide { side: WallSide; from: [Mm, Mm]; to: [Mm, Mm]; length: Mm }

export interface StripLayout {
  P: Mm;                          // lábazat-tengely kerülete
  sides: StripSide[];             // 4 szakasz (É, K, D, Ny), sarkoktól sarkokig a tengelyen
  rows: number; blocksPerRow: number; topRowCut: boolean;
  longSills: { w: Mm }[];         // a két szélső beamAxes (keret w-koordináta), hossz L
  shortSills: { l: Mm }[];        // l = bw/2 és L − bw/2 tengely, hossz W − 2·bw
  innerBeamAxes: Mm[];            // beamAxes belső elemei
  innerSupportAxes: Mm[];         // supportAxes, amelyek a rövid lábazat belső élén (bw/2 + blokk/2) túl vannak
  pierCount: number;              // innerBeamAxes.length × innerSupportAxes.length
}

/**
 * Sávalap geometriája a gerendakeret rácsán (Z = 0 a talaj szintje).
 * A lábazat-tengely egy téglalap, a falak külső síkjától `bw / 2`-re befelé mind a négy oldalon;
 * a sáv és a lábazat erre szimmetrikus, a sarkok a kerületben pontosan egyszer számolódnak.
 */
export function stripLayout(plan: Plan): StripLayout {
  const f = frameLayout(plan);
  const { width, length } = plan.building;
  const bw = f.beam.width;
  const h = bw / 2;
  const x0 = h, x1 = width - h, y0 = h, y1 = length - h;
  // az oldalak a wallGeometry sorrendjében; É/D az x, K/Ny az y mentén halad (a floorWallMap u-irányával egyezően)
  const seg = (side: WallSide, from: [Mm, Mm], to: [Mm, Mm]): StripSide =>
    ({ side, from, to, length: Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) });
  const sides: StripSide[] = [
    seg('N', [x0, y0], [x1, y0]),
    seg('E', [x1, y0], [x1, y1]),
    seg('S', [x0, y1], [x1, y1]),
    seg('W', [x0, y0], [x0, y1]),
  ];
  const P = 2 * ((f.L - bw) + (f.W - bw));

  const gc = plan.foundation.frame.groundClearance;
  const rows = Math.ceil(gc / PIER_ROW_H - 1e-9);
  const topRowCut = rows * PIER_ROW_H !== gc;
  const blocksPerRow = Math.ceil(P / PLINTH_BLOCK_LEN - 1e-9);

  const longSills = [{ w: f.beamAxes[0] }, { w: f.beamAxes[f.beamAxes.length - 1] }];
  const shortSills = [{ l: h }, { l: f.L - h }];
  const innerBeamAxes = f.beamAxes.slice(1, -1);
  // a rövid lábazat belső éle a keret végétől: bw/2 (tengely) + a zsalukő fele
  const edge = h + PLINTH_BLOCK_WIDTH[plan.foundation.plinth.block] / 2;
  const innerSupportAxes = f.supportAxes.filter(a => a > edge && a < f.L - edge);
  return {
    P, sides, rows, blocksPerRow, topRowCut, longSills, shortSills, innerBeamAxes, innerSupportAxes,
    pierCount: innerBeamAxes.length * innerSupportAxes.length,
  };
}
