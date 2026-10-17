import { FORMWORK_EXTRA, MESH_SHEET } from '../../catalog';
import { meshLayout } from '../../calc/foundation';
import { frameLayout, framePt, hasFrame } from '../../calc/frame';
import { cm, elGroup, fxCircle, n, type Pt } from '../svgKit';
import { drawEl, elStyle, fxRadius, layerG, type ViewCtx } from './common';

const FORMWORK_BOARD = 25; // zsaluzódeszka vastagsága a rajzon (mm)

/** Gerendakeretes alap felülről: főgerendák, párnafák, támaszok, rögzítési pontok és a támaszrács méretei. */
function drawFrameFoundation(ctx: ViewCtx): string {
  const { plan, scene, kit } = ctx;
  const { width: W, length: L } = plan.building;
  const f = frameLayout(plan);
  const gs = plan.foundation.groundScrew;
  kit.ext(0, 0);
  kit.ext(W, L);
  const geom = kit.snapshot();
  kit.scaleTo(geom);
  const fs = kit.fs;

  let frame = '';
  if (ctx.on('frame')) {
    // párnafák vékony vonallal, rájuk a főgerendák, legfelül a támaszok
    for (const e of scene.elements.filter(x => x.kind === 'joist')) {
      frame += elGroup(e.id, e.kind, kit.rect(e.geom.u, e.geom.v, e.geom.w, e.geom.h, `${kit.fill('lineMuted', 0.08)} ${kit.stroke('lineMuted', 0.6)}`));
    }
    for (const e of scene.elements.filter(x => x.kind === 'beam')) frame += drawEl(kit, e, p => p);
    const rs = Math.max(gs.diameter / 2, fs * 0.45);
    for (const e of scene.elements.filter(x => x.kind === 'support')) {
      frame += elGroup(e.id, e.kind, kit.circle(e.geom.u + e.geom.w / 2, e.geom.v + e.geom.h / 2, rs, elStyle(kit, e.kind)));
    }
  }

  let fx = '';
  if (ctx.on('fasteners')) {
    const r = fxRadius(geom);
    for (const p of scene.fasteners.filter(x => x.group === 'frame')) fx += fxCircle(kit, p.id, p.kind, p.u, p.v, r);
  }
  const outline = kit.rect(0, 0, W, L, `fill="none" ${kit.stroke('lineMuted', 1, [6, 4])}`);

  let dims = '';
  if (ctx.on('dims')) {
    const row = fs * 2.4;
    // a w = 0 (ill. l = 0) épületél mentén, kifelé
    const P = (l: number, w: number): Pt => framePt(f, l, w);
    const out = (a: Pt, b: Pt, away: Pt): number => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      return Math.sign(-dy * (away[0] - a[0]) + dx * (away[1] - a[1])) || 1;
    };
    const supports = [0, ...f.supportAxes, f.L].map(l => P(l, 0));
    const sOut = out(supports[0], supports[supports.length - 1], P(0, -1));
    dims += kit.chain(supports, sOut * row);
    dims += kit.dim(...supports[0], ...supports[supports.length - 1], sOut * row * 2, cm(f.L));
    const rows = [0, ...f.beamAxes, f.W].map(w => P(0, w));
    const rOut = out(rows[0], rows[rows.length - 1], P(-1, 0));
    dims += kit.chain(rows, rOut * row);
    dims += kit.dim(...rows[0], ...rows[rows.length - 1], rOut * row * 2, cm(f.W));
    if (plan.foundation.type === 'groundScrew') {
      const n = f.beamAxes.length * f.supportAxes.length;
      dims += kit.text(0, -row * 2 - fs * 2.6,
        `Talajcsavar: ${n} db Ø${gs.diameter} × ${cm(gs.length)}, fej ${cm(plan.foundation.frame.groundClearance)}-rel a talaj fölött`,
        { anchor: 'start' });
    }
  }
  return layerG('frame', frame) + layerG('fasteners', fx) + outline + layerG('dims', dims + kit.takeLabels());
}

/** Alapnézet alaprajzi koordinátákban (0,0 = az épület sarka): zsaluzás, lemez, hálótáblák; gerendakeretes alapnál a keret. */
export function drawFoundation(ctx: ViewCtx): string {
  if (hasFrame(ctx.plan)) return drawFrameFoundation(ctx);
  const { plan, scene, kit } = ctx;
  const so = plan.foundation.slabOverhang;
  const { width: W, length: L } = plan.building;
  const slabX = W + 2 * so;
  const slabY = L + 2 * so;

  let frame = '';
  if (ctx.on('frame')) {
    // zsaluzás: keret a lemez körül (külső és belső téglalap, evenodd kitöltéssel)
    const o = -so - FORMWORK_BOARD;
    const ring = (x: number, y: number, w: number, h: number): string => `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} Z`;
    frame += kit.path(`${ring(o, o, slabX + 2 * FORMWORK_BOARD, slabY + 2 * FORMWORK_BOARD)} ${ring(-so, -so, slabX, slabY)}`,
      [[o, o], [W + so + FORMWORK_BOARD, L + so + FORMWORK_BOARD]], `fill-rule="evenodd" ${kit.fill('wood', 0.6)} ${kit.stroke('line')}`);
    frame += kit.rect(-so, -so, slabX, slabY, `${kit.fill('concrete', 0.25)} ${kit.stroke('line')}`);
  } else {
    kit.ext(-so - FORMWORK_BOARD, -so - FORMWORK_BOARD);
    kit.ext(W + so + FORMWORK_BOARD, L + so + FORMWORK_BOARD);
  }
  const geom = kit.snapshot();
  kit.scaleTo(geom);
  const fs = kit.fs;

  let mesh = '';
  if (ctx.on('mesh')) {
    const sheets = scene.elements.filter(e => e.kind === 'meshSheet');
    sheets.forEach((e, i) => {
      const cx = e.geom.u + e.geom.w / 2;
      const cy = e.geom.v + e.geom.h / 2;
      mesh += drawEl(kit, e, p => p, kit.text(cx, cy, String(i + 1), { color: 'sheet' }));
    });
  }
  const outline = kit.rect(0, 0, W, L, `fill="none" ${kit.stroke('lineMuted', 1, [6, 4])}`);

  let dims = '';
  if (ctx.on('dims')) {
    const row = fs * 2.4;
    dims += kit.dim(-so, L + so, W + so, L + so, row, cm(slabX));
    dims += kit.dim(W + so, L + so, W + so, -so, row, cm(slabY));
    const { cols, rows, sheetW, sheetL } = meshLayout(plan);
    dims += kit.text(-so, -so - fs * 3, `Zsaluzás: ${cm(plan.foundation.slabThickness + FORMWORK_EXTRA)} magas deszka`, { anchor: 'start' });
    dims += kit.text(-so, -so - fs * 1.5, `Háló: ${cols * rows} tábla (${cm(sheetW)} × ${cm(sheetL)}), átfedés ${cm(MESH_SHEET.overlap)}`, { anchor: 'start' });
  }
  return layerG('frame', frame) + layerG('mesh', mesh) + outline + layerG('dims', dims + kit.takeLabels());
}
