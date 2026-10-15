import { FORMWORK_EXTRA, MESH_SHEET } from '../../catalog';
import { meshLayout } from '../../calc/foundation';
import { cm, n } from '../svgKit';
import { drawEl, layerG, type ViewCtx } from './common';

const FORMWORK_BOARD = 25; // zsaluzódeszka vastagsága a rajzon (mm)

/** Alapnézet alaprajzi koordinátákban (0,0 = az épület sarka): zsaluzás, lemez, hálótáblák. */
export function drawFoundation(ctx: ViewCtx): string {
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
