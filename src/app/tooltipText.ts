import type { Plan } from '../model/types';
import type { Element, FastenerRef, Scene } from '../scene/types';
import { formatCmNum } from '../ui/format';
import { groupLength, neighbours } from '../scene/neighbours';
import { pierDesc } from '../calc/supports';
import { PLINTH_BLOCK_WIDTH } from '../catalog';

const GROUP_NAMES: Record<string, string> = {
  'wall.N': 'É fal', 'wall.E': 'K fal', 'wall.S': 'D fal', 'wall.W': 'Ny fal',
  'roof.L': 'bal tetősík', 'roof.R': 'jobb tetősík', 'roof.M': 'tetősík', 'roof.ridge': 'gerinc', 'roof.collar': 'fogópárok',
  floor: 'padló', foundation: 'alap', frame: 'gerendakeret',
};
const VERTICAL = new Set(['stud', 'cornerStud', 'gableStud', 'kingStud', 'jackStud', 'cripple']);

const c = formatCmNum;

export function groupName(group: string): string {
  return GROUP_NAMES[group] ?? group;
}

/** Rögzítések összefoglalója: címkénként összevonva; függőleges elem csavarjainál „(alul N, felül M)”. */
function fastenerSummary(scene: Scene, el: Element): string {
  const fs = el.fasteners.map(id => scene.fasteners.find(f => f.id === id)).filter((f): f is FastenerRef => f !== undefined);
  if (fs.length === 0) return '—';
  const base = (f: FastenerRef): string => f.label.replace(/^\d+ db /, '');
  const total = new Map<string, number>();
  for (const f of fs) total.set(base(f), (total.get(base(f)) ?? 0) + f.count);
  if (VERTICAL.has(el.kind) && fs.every(f => f.kind === 'frameScrew') && total.size === 1) {
    const mid = el.geom.v + el.geom.h / 2;
    const low = fs.filter(f => f.v < mid).reduce((s, f) => s + f.count, 0);
    const high = fs.filter(f => f.v >= mid).reduce((s, f) => s + f.count, 0);
    const [label, sum] = [...total][0];
    return `${sum} db ${label} (alul ${low}, felül ${high})`;
  }
  return [...total].map(([label, sum]) => `${sum} db ${label}`).join(', ');
}

function openingLines(plan: Plan, el: Element, errors: string[]): string[] {
  const o = plan.openings.find(x => x.id === el.openingId);
  const out: string[] = [];
  if (o) {
    out.push(`${el.label} · ${groupName(el.group)}`);
    out.push(`${o.type === 'door' ? 'Ajtó' : 'Ablak'}: ${c(o.width)} × ${c(o.height)} cm`);
    out.push(`Pozíció: ${c(o.offset)} cm a fal elejétől`);
    if (o.type === 'window') out.push(`Mellvéd: ${c(o.sillHeight)} cm`);
  } else {
    out.push(`${el.label} · ${groupName(el.group)}`, `${c(el.geom.w)} × ${c(el.geom.h)} cm`);
  }
  return [...out, ...errors];
}

/** Pozíciósor a csoport fajtája szerint: fal (a fal elejétől, magasan), tető (a tetősík szélétől, az eresztől), egyébként x/y. */
function positionLine(group: string, along: number, v: number, x = along): string {
  if (group.startsWith('wall.')) return `Pozíció: ${c(along)} cm a fal elejétől, ${c(v)} cm magasan`;
  if (group.startsWith('roof.')) return `Pozíció: ${c(along)} cm a tetősík szélétől, ${c(v)} cm az eresztől`;
  return `Pozíció: x: ${c(x)} cm, y: ${c(v)} cm`;
}

/** A támasz méretsora: talajcsavarnál átmérő és hossz, pontalapnál/betonpillérnél a talp (és a pillér). */
function supportSize(plan: Plan, el: Element): string {
  const f = plan.foundation;
  if (f.type === 'groundScrew') return `Ø${c(el.geom.w)} cm · hossza ${c(el.length)} cm`;
  if (f.type === 'stripFooting') {
    // a belső pillér talpa a sáv szélességű négyzet, a pillér a lábazat zsalukövéből
    const s = c(PLINTH_BLOCK_WIDTH[f.plinth.block]);
    return `Talp ${c(f.strip.width)}×${c(f.strip.width)} cm · ${c(f.strip.depth)} cm mélyen · ${s}×${s} cm-es zsalukő pillér`;
  }
  const foot = `Talp ${c(f.footing.size)}×${c(f.footing.size)} cm · ${c(f.footing.depth)} cm mélyen`;
  return f.type === 'concretePier' ? `${foot} · ${pierDesc(f.pier.kind)}` : foot;
}

/** A buborék sorai egy elemhez (`el`) vagy rögzítéshez (`fx`); hibás nyílásnál a hibaüzenetekkel (`errors`). */
export function tooltipLines(scene: Scene, plan: Plan, target: { el?: string; fx?: string }, errors: string[] = []): string[] {
  if (target.fx) {
    const f = scene.fasteners.find(x => x.id === target.fx);
    if (!f) return [];
    const els = f.elementIds.map(id => scene.elements.find(e => e.id === id)?.label).filter((l): l is string => !!l);
    return [f.label, `${f.count} db`, positionLine(f.group, f.u, f.v), `Elem: ${els.length ? els.join(', ') : '—'}`];
  }
  const el = scene.elements.find(e => e.id === target.el);
  if (!el) return [];
  if (el.kind === 'opening') return openingLines(plan, el, errors);

  const nb = neighbours(scene, groupLength(plan, el.group), el.id);
  const g = el.geom;
  const f = plan.foundation;
  const size = el.kind === 'support' ? supportSize(plan, el)
    : el.kind === 'stripFooting' ? `${c(f.strip.width)} cm széles · ${c(f.strip.depth)} cm mély · hossza ${c(el.length)} cm`
    : el.kind === 'plinth'
      ? `${c(PLINTH_BLOCK_WIDTH[f.plinth.block])} cm-es zsalukő · ${c(f.frame.groundClearance)} cm magas · hossza ${c(el.length)} cm`
    : el.section ? `${c(el.section.t)}×${c(el.section.w)} cm · hossza ${c(el.length)} cm` : `${c(g.w)} × ${c(g.h)} cm`;
  const pos = positionLine(el.group, nb.fromStart, g.v, g.u);
  const side = (axis?: number, clear?: number): string => (axis === undefined || clear === undefined ? '—' : `${c(axis)} cm (${c(clear)} szabad)`);
  return [
    `${el.label} · ${groupName(el.group)}`,
    size,
    pos,
    `Szomszédok: ← ${side(nb.axisLeft, nb.clearLeft)} · ${side(nb.axisRight, nb.clearRight)} →`,
    `Rögzítés: ${fastenerSummary(scene, el)}`,
  ];
}

/** A buborék bal-felső sarka: a mutatótól +14,+14 px; ha kilógna, a mutató másik oldalára kerül, majd [4, vp−tip−4]-be szorul. */
export function placeTooltip(px: number, py: number, tipW: number, tipH: number, vpW: number, vpH: number): { left: number; top: number } {
  const OFF = 14;
  const MARGIN = 4;
  let left = px + OFF;
  let top = py + OFF;
  if (left + tipW > vpW) left = px - OFF - tipW;
  if (top + tipH > vpH) top = py - OFF - tipH;
  const clamp = (v: number, vp: number, tip: number): number => Math.max(MARGIN, Math.min(v, vp - tip - MARGIN));
  return { left: clamp(left, vpW, tipW), top: clamp(top, vpH, tipH) };
}
