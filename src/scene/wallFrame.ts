import type { Plan } from '../model/types';
import {
  ANCHOR_EDGE, ANCHOR_LABEL, ANCHOR_SPACING, FRAME_SCREWS_PER_END, FRAME_SCREW_LABEL,
} from '../catalog';
import { studLengthAt, studPositions, wallGeometry } from '../calc/geometry';
import type { Element, ElementKind, FastenerRef, Geom } from './types';

const LABELS: Partial<Record<ElementKind, string>> = {
  stud: 'Oszlop', cornerStud: 'Sarokoszlop (elforgatva)', gableStud: 'Oromoszlop', kingStud: 'Teljes oszlop',
  jackStud: 'Kiváltó oszlop', cripple: 'Rövid oszlop', sill: 'Könyöklő', header: 'Áthidaló', topPlate: 'Koszorú',
};
const VERTICAL = new Set<ElementKind>(['stud', 'cornerStud', 'gableStud', 'kingStud', 'jackStud', 'cripple']);

interface Draft { kind: ElementKind; pieceLabel?: string; length: number; geom: Geom; openingId?: string; label?: string; rotated?: boolean }

export function wallFrameElements(plan: Plan): { elements: Element[]; fasteners: FastenerRef[] } {
  const section = plan.walls.studSection;
  const { t, w } = section;
  const plates = plan.walls.topPlate === 'double' ? 2 : 1;
  const elements: Element[] = [];
  const fasteners: FastenerRef[] = [];

  for (const wall of wallGeometry(plan)) {
    const group = `wall.${wall.side}`;
    const len = wall.length;
    const drafts: Draft[] = [];
    const timber = (kind: ElementKind, pieceLabel: string, length: number, geom: Geom, openingId?: string): void => {
      drafts.push({ kind, pieceLabel, length, geom, openingId });
    };

    timber('bottomPlate', 'talpgerenda', len, { u: 0, v: 0, w: len, h: t });
    const dh = wall.hEnd - wall.hStart;
    const plateLen = Math.sqrt(len ** 2 + dh ** 2);
    const angle = (Math.atan2(dh, len) * 180) / Math.PI;
    for (let k = 0; k < plates; k++) {
      timber('topPlate', 'koszorú', plateLen, { u: 0, v: wall.hStart - (k + 1) * t, w: plateLen, h: t, angle });
    }
    for (const p of studPositions(plan, wall)) {
      const h = studLengthAt(plan, wall, p);
      timber('stud', 'oszlop', h, { u: p, v: t, w: t, h });
    }
    if (wall.full) {
      // L alakú sarok: a végoszlop mellett egy 90°-kal elforgatott oszlop (széles lapja a fal mentén, belső síkkal egy vonalban)
      for (const u of [t, len - t - w]) {
        const h = Math.min(studLengthAt(plan, wall, u), studLengthAt(plan, wall, u + w)); // lejtős falon a szélesség mentén a rövidebb
        drafts.push({ kind: 'cornerStud', pieceLabel: 'sarokoszlop', length: h, geom: { u, v: t, w, h }, rotated: true });
      }
    }
    if (wall.gableRise > 0) {
      for (const p of studPositions(plan, wall, false)) {
        const h = wall.gableRise * (1 - Math.abs(p - len / 2) / (len / 2));
        if (h >= 100) timber('gableStud', 'oromoszlop', h, { u: p, v: wall.hStart, w: t, h });
      }
    }
    for (const o of plan.openings.filter(op => op.wall === wall.side)) {
      drafts.push({
        kind: 'opening', length: o.width, openingId: o.id, label: o.type === 'door' ? 'Ajtó' : 'Ablak',
        geom: { u: o.offset, v: t + o.sillHeight, w: o.width, h: o.height },
      });
      const H = studLengthAt(plan, wall, o.offset + o.width / 2);
      const top = o.sillHeight + o.height;
      for (const u of [o.offset - 2 * t, o.offset + o.width + t]) timber('kingStud', 'teljes oszlop', H, { u, v: t, w: t, h: H }, o.id);
      for (const u of [o.offset - t, o.offset + o.width]) timber('jackStud', 'kiváltó oszlop', top, { u, v: t, w: t, h: top }, o.id);
      for (let i = 0; i < 2; i++) {
        timber('header', 'áthidaló', o.width + 2 * t, { u: o.offset - t, v: t + top, w: o.width + 2 * t, h: w }, o.id);
      }
      const n = Math.ceil(o.width / plan.walls.studSpacing - 1e-9);
      const cu = (i: number): number => o.offset + ((i + 0.5) * o.width) / n - t / 2;
      const upper = H - top - w;
      if (upper >= 50) {
        for (let i = 0; i < n; i++) timber('cripple', 'felső rövid oszlop', upper, { u: cu(i), v: t + top + w, w: t, h: upper }, o.id);
      }
      if (o.type === 'window') {
        timber('sill', 'könyöklő', o.width, { u: o.offset, v: o.sillHeight, w: o.width, h: t }, o.id);
        if (o.sillHeight - t >= 50) {
          for (let i = 0; i < n; i++) timber('cripple', 'alsó rövid oszlop', o.sillHeight - t, { u: cu(i), v: t, w: t, h: o.sillHeight - t }, o.id);
        }
      }
    }

    // azonosítók: fajtánként 1-től, u szerint növekvő sorrendben (stabil)
    const counters = new Map<ElementKind, number>();
    const sorted = drafts.map((d, i) => ({ d, i })).sort((a, b) =>
      a.d.geom.u - b.d.geom.u || (a.d.kind === 'topPlate' ? b.d.geom.v - a.d.geom.v : a.d.geom.v - b.d.geom.v) || a.i - b.i).map(x => x.d);
    const wallEls: Element[] = [];
    for (const d of sorted) {
      const idx = (counters.get(d.kind) ?? 0) + 1;
      counters.set(d.kind, idx);
      const label = d.label ?? (d.kind === 'bottomPlate' ? 'Talpgerenda' : `${LABELS[d.kind]} #${idx}`);
      wallEls.push({
        id: `${group}.${d.kind}.${idx}`, kind: d.kind, label, group, category: 'Fal',
        ...(d.pieceLabel ? { pieceLabel: d.pieceLabel, section } : {}),
        length: d.length, geom: d.geom, fasteners: [],
        ...(d.openingId ? { openingId: d.openingId } : {}),
        ...(d.rotated ? { rotated: true } : {}),
      });
    }

    // vázcsavarok
    const screw = (e: Element, name: string, u: number, v: number): void => {
      const f: FastenerRef = {
        id: `${e.id}.frameScrew.${name}`, kind: 'frameScrew', group, u, v,
        count: FRAME_SCREWS_PER_END, label: `${FRAME_SCREWS_PER_END} db ${FRAME_SCREW_LABEL}`, elementIds: [e.id],
      };
      fasteners.push(f);
      e.fasteners.push(f.id);
    };
    for (const e of wallEls) {
      const g = e.geom;
      if (VERTICAL.has(e.kind)) {
        const cx = g.u + g.w / 2;
        screw(e, 'bottom', cx, g.v);
        if (e.kind !== 'gableStud') screw(e, 'top', cx, g.v + g.h);
      } else if (e.kind === 'header') {
        const cy = g.v + g.h / 2;
        screw(e, 'start', g.u + t / 2, cy);
        screw(e, 'end', g.u + g.w - t / 2, cy);
      }
    }

    // ászokcsavarok
    const doors = plan.openings.filter(o => o.wall === wall.side && o.type === 'door');
    const cand: number[] = [];
    for (let u = ANCHOR_EDGE; u <= len - ANCHOR_EDGE + 1e-9; u += ANCHOR_SPACING) cand.push(u);
    cand.push(len - ANCHOR_EDGE);
    for (const d of doors) {
      for (const u of [d.offset - ANCHOR_EDGE, d.offset + d.width + ANCHOR_EDGE]) if (u >= 0 && u <= len) cand.push(u);
    }
    const pts: number[] = [];
    const valid = [...new Set(cand)]
      .filter(u => !doors.some(d => u > d.offset && u < d.offset + d.width))
      .sort((a, b) => a - b);
    // összevonáskor a korábbi (kisebb u) pont marad
    for (const u of valid) if (pts.length === 0 || u - pts[pts.length - 1] >= 100) pts.push(u);
    const plateIds = wallEls.filter(e => e.kind === 'bottomPlate').map(e => e.id);
    pts.forEach((u, i) => {
      fasteners.push({
        id: `${group}.anchor.${i + 1}`, kind: 'anchor', group, u, v: t / 2, count: 1, label: ANCHOR_LABEL, elementIds: plateIds,
      });
    });
    elements.push(...wallEls);
  }
  return { elements, fasteners };
}
