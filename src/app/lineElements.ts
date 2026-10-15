import type { Mm, Section } from '../model/types';
import type { Category, MaterialLine } from '../calc/types';
import { CATEGORY_ORDER } from '../calc';
import type { FastenerKind, Scene } from '../scene/types';
import { BATTEN_SECTION, KERF, WALL_BATTEN_PIECE_LENGTH } from '../catalog';
import { STEPS, type LayerId, type StepId, type ViewId } from './steps';

/** Az a nézet, amelyik a csoport elemeit rajzolja. */
function viewOfGroup(group: string): ViewId {
  if (group.startsWith('wall.')) return group as ViewId;
  if (group.startsWith('roof.')) return 'roof';
  if (group === 'foundation') return 'foundation';
  return 'floor';
}

/** A nézethez tartozó lépés (falak → Falak, tető → Tető, alap → Alap, egyéb → Épület). */
export function stepForView(view: ViewId): StepId {
  if (view.startsWith('wall.')) return 'walls';
  if (view === 'roof' || view === 'gable') return 'roof';
  if (view === 'foundation') return 'foundation';
  const found = STEPS.find(s => s.id !== 'materials' && s.views.includes(view));
  return found?.id ?? 'building';
}

const TIMBER = /^timber\.([^.]+)\.(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\.(\d+(?:\.\d+)?)$/;
const FASTENER_LINES: Record<string, FastenerKind> = {
  'fix.anchors': 'anchor', 'fix.frameScrews': 'frameScrew', 'fix.osbScrews': 'osbScrew', 'fix.hurricaneTies': 'hurricaneTie',
};

/** Az anyaglista-sorhoz tartozó rajzi elemek (vagy rögzítési pontok), a hozzájuk illő nézettel; nincs rajzi megfelelő: null. */
export function elementsForLine(scene: Scene, line: MaterialLine): { view: ViewId; ids: string[]; layer?: LayerId } | null {
  const m = TIMBER.exec(line.id);
  if (m) {
    const [, cat, t, w, stock] = m;
    const els = scene.elements.filter(e => e.category === cat && e.section !== undefined
      && e.section.t === Number(t) && e.section.w === Number(w) && scene.cut[e.id]?.stockLength === Number(stock));
    if (els.length === 0) return null;
    const batten = els.every(e => e.kind === 'roofBatten' || e.kind === 'counterBatten');
    return { view: viewOfGroup(els[0].group), ids: els.map(e => e.id), layer: batten ? 'battens' : 'frame' };
  }
  if (line.id === 'wall.osb') {
    const sheets = scene.elements.filter(e => e.kind === 'osbSheet');
    if (sheets.length === 0) return null;
    const east = sheets.find(e => e.group === 'wall.E');
    return { view: viewOfGroup((east ?? sheets[0]).group), ids: sheets.map(e => e.id), layer: 'sheathing' };
  }
  const kind = FASTENER_LINES[line.id];
  if (kind) {
    const pts = scene.fasteners.filter(f => f.kind === kind);
    if (pts.length === 0) return null;
    return { view: kind === 'anchor' ? 'floor' : viewOfGroup(pts[0].group), ids: pts.map(f => f.id), layer: 'fasteners' };
  }
  return null;
}

export interface CutStick {
  key: string; category: Category; section: Section; stockLength: Mm; index: number;
  pieces: Array<{ id: string; label: string; offset: Mm; length: Mm }>; rest: Mm;
}

/** A vágási terv szálai a scene.cut-ból: kategória, keresztmetszet, szálhossz, sorszám szerint rendezve. */
export function cutSticks(scene: Scene): CutStick[] {
  const byEl = new Map(scene.elements.map(e => [e.id, e]));
  const groups = new Map<string, CutStick & { raw: Array<{ id: string; offset: Mm }> }>();
  for (const [id, ref] of Object.entries(scene.cut)) {
    const el = byEl.get(id);
    const category: Category = el ? el.category : 'Fal';
    const section = el?.section ?? BATTEN_SECTION;
    const key = `${category}|${section.t}x${section.w}|${ref.stockLength}|${ref.stockIndex}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, category, section, stockLength: ref.stockLength, index: ref.stockIndex, pieces: [], rest: 0, raw: [] };
      groups.set(key, g);
    }
    g.raw.push({ id, offset: ref.offset });
  }
  const out: CutStick[] = [];
  for (const g of groups.values()) {
    g.raw.sort((a, b) => a.offset - b.offset);
    g.pieces = g.raw.map((r, i) => {
      const el = byEl.get(r.id);
      let length: Mm;
      let label: string;
      if (el) {
        length = Math.min(el.length, g.stockLength);
        label = el.length > g.stockLength ? `${el.label} (toldott)` : el.label;
      } else {
        const next = g.raw[i + 1]?.offset;
        length = next !== undefined ? next - r.offset - KERF : Math.min(WALL_BATTEN_PIECE_LENGTH, g.stockLength - r.offset);
        label = 'Fali léc';
      }
      return { id: r.id, label, offset: r.offset, length };
    });
    g.rest = g.stockLength - g.pieces.reduce((a, p) => a + p.length, 0) - KERF * Math.max(0, g.pieces.length - 1);
    const { raw: _raw, ...stick } = g;
    out.push(stick);
  }
  const catRank = (c: Category) => CATEGORY_ORDER.indexOf(c);
  return out.sort((a, b) => catRank(a.category) - catRank(b.category) || a.section.t - b.section.t || a.section.w - b.section.w
    || a.stockLength - b.stockLength || a.index - b.index);
}

/** Azonos szálak (szálhossz, darabsor, maradék) csoportja; a sorrend az első előfordulásé. */
export function cutVariants(sticks: CutStick[]): CutStick[][] {
  const m = new Map<string, CutStick[]>();
  for (const s of sticks) {
    const sig = [s.stockLength, ...s.pieces.map(p => p.label.replace(/\s*#\d+/, '') + ':' + p.length), Math.round(s.rest)].join('|');
    const g = m.get(sig);
    if (g) g.push(s); else m.set(sig, [s]);
  }
  return [...m.values()];
}
