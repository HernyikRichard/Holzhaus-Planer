import type { jsPDF } from 'jspdf';
import type { Plan, RoofShape, WallSide } from '../model/types';
import { CATEGORY_ORDER, type CalcOutput } from '../calc';
import { formatQty } from '../ui/format';
import { buildScene } from '../scene/build';
import { supplyFor } from '../pricing/supply';
import { renderStandalone } from '../viewer/render';
import { PRINT_PALETTE } from '../viewer/theme';
import type { LayerId, ViewId } from '../viewer/layers';
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import { CUT_PLAN_HEADER, cutPlanRows, fitRect, paginateRows, substituteCssVars, type TableItem } from './pdfLayout';

export interface PdfOptions { drawings: boolean; materials: boolean; explanations: boolean; cutPlan: boolean }

const FONT = 'DejaVuSans';
const MARGIN = 15;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TITLE_Y = 22;
const BODY_TOP = 28; // a címsor alatti tartalom kezdete
const BODY_BOTTOM = 280; // a lábléc fölött
const FOOTER_Y = 289;

const ROOF_NAMES: Record<RoofShape, string> = { flat: 'Lapostető', mono: 'Félnyeregtető', gable: 'Nyeregtető' };
const SIDE_NAMES: Record<WallSide, string> = { N: 'Északi', E: 'Keleti', S: 'Déli', W: 'Nyugati' };
const SIDES: WallSide[] = ['N', 'E', 'S', 'W'];
const PDF_LAYERS: Record<LayerId, boolean> = {
  frame: true, sheathing: true, battens: true, fasteners: true, dims: true, grid: false, mesh: true,
};

async function fontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font load failed: ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function viewBoxSize(svg: string): { w: number; h: number } {
  const m = /viewBox="\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/.exec(svg);
  if (!m) throw new Error('SVG without viewBox');
  return { w: Number(m[1]), h: Number(m[2]) };
}

export async function exportPdf(plan: Plan, output: CalcOutput, opts: PdfOptions): Promise<Blob> {
  const [{ jsPDF: JsPDF }, { svg2pdf }, regular, bold] = await Promise.all([
    import('jspdf'), import('svg2pdf.js'), fontBase64(regularUrl), fontBase64(boldUrl),
  ]);
  const doc: jsPDF = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');

  const setText = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(0);
  };
  const pageTitle = (title: string) => { setText(15, 'bold'); doc.text(title, MARGIN, TITLE_Y); };

  async function drawSvg(svg: string, x: number, y: number, w: number, h: number): Promise<void> {
    const size = viewBoxSize(svg);
    const box = fitRect(size.w, size.h, w, h, x, y);
    const parsed = new DOMParser().parseFromString(substituteCssVars(svg, {}, FONT), 'image/svg+xml');
    // Egyes számításokhoz (stílusok, szövegméret) csatolt elem kell.
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
    host.append(document.importNode(parsed.documentElement, true));
    document.body.append(host);
    try {
      await svg2pdf(host.firstElementChild as SVGElement, doc, box);
    } finally {
      host.remove();
    }
  }

  // 1. Címlap
  setText(26, 'bold');
  const nameLines = doc.splitTextToSize(plan.name, CONTENT_W) as string[];
  doc.text(nameLines, MARGIN, 60);
  const y = 60 + nameLines.length * 11 + 6;
  setText(12);
  const cm = (mm: number) => formatQty(mm / 10, 1);
  const { width, length, wallHeight } = plan.building;
  doc.text('Szélesség × hosszúság × falmagasság:', MARGIN, y);
  setText(12, 'bold');
  doc.text(`${cm(width)} × ${cm(length)} × ${cm(wallHeight)} cm`, MARGIN, y + 7);
  setText(12);
  const roof = plan.roof.shape === 'flat'
    ? ROOF_NAMES.flat
    : `${ROOF_NAMES[plan.roof.shape]}, dőlésszög ${formatQty(plan.roof.pitch, 1)}°`;
  doc.text('Tetőforma:', MARGIN, y + 18);
  setText(12, 'bold');
  doc.text(roof, MARGIN, y + 25);
  setText(11);
  doc.text(`Készült: ${new Date().toLocaleDateString('hu-HU')}`, MARGIN, y + 38);

  // 2. Rajzok
  if (opts.drawings) {
    const scene = buildScene(plan, supplyFor(plan));
    const svgOf = (view: ViewId) => renderStandalone({ plan, scene, view, layers: PDF_LAYERS, palette: PRINT_PALETTE });
    const fullPage = (title: string, view: ViewId) => {
      doc.addPage();
      pageTitle(title);
      return drawSvg(svgOf(view), MARGIN, BODY_TOP, CONTENT_W, BODY_BOTTOM - BODY_TOP);
    };
    await fullPage('Alaprajz', 'floor');
    for (let i = 0; i < SIDES.length; i += 2) { // homlokzatok: oldalanként kettő
      doc.addPage();
      pageTitle('Homlokzatok');
      const slot = (BODY_BOTTOM - BODY_TOP) / 2;
      for (let k = 0; k < 2; k++) {
        const side = SIDES[i + k];
        const top = BODY_TOP + k * slot;
        setText(11, 'bold');
        doc.text(`${SIDE_NAMES[side]} homlokzat`, MARGIN, top + 4);
        await drawSvg(svgOf(`wall.${side}` as ViewId), MARGIN, top + 8, CONTENT_W, slot - 12);
      }
    }
    await fullPage('Metszet', 'section');
    await fullPage('Tetőnézet', 'roof');
    await fullPage('Oromfal', 'gable');
    await fullPage('Alap', 'foundation');
  }

  // 3. Anyaglista
  if (opts.materials) {
    const cols = opts.explanations
      ? { name: 55, qty: 20, unit: 16, sec: 35, expl: 54 }
      : { name: 80, qty: 26, unit: 24, sec: 50, expl: 0 };
    const x = { name: MARGIN, unit: MARGIN + cols.name + cols.qty };
    const xSec = x.unit + cols.unit;
    const xExpl = xSec + cols.sec;
    const PAD = 1.5; const LH = 3.8; const FS = 8.5;
    const lhf = LH / (FS * 0.3528); // sortávolság-tényező a kívánt LH mm-hez
    const HEADER_H = 7;
    const fit = (s: string, w: number) => (s ? doc.splitTextToSize(s, w - 2 * PAD) as string[] : []);

    interface Row {
      item: TableItem; title?: string;
      cells?: { name: string[]; qty: string; unit: string; sec: string[]; expl: string[] };
    }
    const rows: Row[] = [];
    setText(FS);
    for (const cat of CATEGORY_ORDER) {
      const lines = output.lines.filter(l => l.category === cat);
      if (lines.length === 0) continue;
      rows.push({ item: { kind: 'subtitle', height: 7 }, title: cat });
      for (const l of lines) {
        const cells = {
          name: fit(l.name, cols.name), qty: formatQty(l.quantity), unit: l.unit,
          sec: fit(l.secondary ?? '', cols.sec), expl: opts.explanations ? fit(l.explanation, cols.expl) : [],
        };
        const n = Math.max(cells.name.length, cells.sec.length, cells.expl.length, 1);
        rows.push({ item: { kind: 'row', height: n * LH + 2 * PAD }, cells });
      }
    }
    const pages = paginateRows(rows.map(r => r.item), BODY_BOTTOM - BODY_TOP, HEADER_H);
    const tableRight = MARGIN + CONTENT_W;
    pages.forEach((idxs, pi) => {
      doc.addPage();
      pageTitle(pi === 0 ? 'Anyaglista' : 'Anyaglista (folytatás)');
      let ty = BODY_TOP;
      doc.setFillColor(230, 230, 226);
      doc.rect(MARGIN, ty, CONTENT_W, HEADER_H, 'F');
      setText(FS, 'bold');
      const base = ty + HEADER_H / 2 + 1.3;
      doc.text('Anyag', x.name + PAD, base);
      doc.text('Mennyiség', x.unit - PAD, base, { align: 'right' });
      doc.text('Egység', x.unit + PAD, base);
      doc.text('Kiegészítő', xSec + PAD, base);
      if (opts.explanations) doc.text('Számítás', xExpl + PAD, base);
      ty += HEADER_H;
      doc.setDrawColor(200);
      doc.setLineWidth(0.15);
      for (const i of idxs) {
        const r = rows[i];
        if (r.title !== undefined) {
          setText(10, 'bold');
          doc.text(r.title, MARGIN, ty + 5);
          doc.line(MARGIN, ty + 6, tableRight, ty + 6);
        } else if (r.cells) {
          const c = r.cells;
          setText(FS);
          const t = ty + PAD + 2.8;
          doc.text(c.name, x.name + PAD, t, { lineHeightFactor: lhf });
          doc.text(c.qty, x.unit - PAD, t, { align: 'right' });
          doc.text(c.unit, x.unit + PAD, t);
          if (c.sec.length) doc.text(c.sec, xSec + PAD, t, { lineHeightFactor: lhf });
          if (c.expl.length) doc.text(c.expl, xExpl + PAD, t, { lineHeightFactor: lhf });
          doc.line(MARGIN, ty + r.item.height, tableRight, ty + r.item.height);
        }
        ty += r.item.height;
      }
    });
  }

  // 3b. Vágási terv
  if (opts.cutPlan) {
    const rows = cutPlanRows(buildScene(plan, supplyFor(plan)));
    const colW = [58, 38, 62, 22];
    const colX = colW.map((_, i) => MARGIN + colW.slice(0, i).reduce((a, b) => a + b, 0));
    const PAD = 1.5; const LH = 3.8; const FS = 8.5; const HEADER_H = 7;
    const lhf = LH / (FS * 0.3528);
    setText(FS);
    const cells = rows.map(r => r.map((c, i) => doc.splitTextToSize(c, colW[i] - 2 * PAD) as string[]));
    const items: TableItem[] = cells.map(c => ({ kind: 'row', height: Math.max(...c.map(l => l.length), 1) * LH + 2 * PAD }));
    const pages = paginateRows(items, BODY_BOTTOM - BODY_TOP, HEADER_H);
    pages.forEach((idxs, pi) => {
      doc.addPage();
      pageTitle(pi === 0 ? 'Vágási terv' : 'Vágási terv (folytatás)');
      let ty = BODY_TOP;
      doc.setFillColor(230, 230, 226);
      doc.rect(MARGIN, ty, CONTENT_W, HEADER_H, 'F');
      setText(FS, 'bold');
      CUT_PLAN_HEADER.forEach((h, i) => doc.text(h, colX[i] + PAD, ty + HEADER_H / 2 + 1.3));
      ty += HEADER_H;
      doc.setDrawColor(200);
      doc.setLineWidth(0.15);
      for (const i of idxs) {
        setText(FS);
        cells[i].forEach((c, k) => doc.text(c, colX[k] + PAD, ty + PAD + 2.8, { lineHeightFactor: lhf }));
        doc.line(MARGIN, ty + items[i].height, MARGIN + CONTENT_W, ty + items[i].height);
        ty += items[i].height;
      }
    });
  }

  // 4. Figyelmeztetések
  if (output.warnings.length > 0) {
    doc.addPage();
    pageTitle('Figyelmeztetések');
    let wy = BODY_TOP;
    setText(10);
    for (const w of output.warnings) {
      const lines = doc.splitTextToSize(w, CONTENT_W - 5) as string[];
      const h = lines.length * 4.6 + 2;
      if (wy + h > BODY_BOTTOM) {
        doc.addPage();
        pageTitle('Figyelmeztetések (folytatás)');
        setText(10);
        wy = BODY_TOP;
      }
      doc.text('•', MARGIN, wy + 3.5);
      doc.text(lines, MARGIN + 5, wy + 3.5);
      wy += h;
    }
  }

  // Lábléc minden oldalon
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setText(8);
    doc.setTextColor(90);
    const text = (doc.splitTextToSize(`Favázas tervező – ${plan.name} – ${p}. oldal`, CONTENT_W) as string[])[0];
    doc.text(text, MARGIN, FOOTER_Y);
  }

  return doc.output('blob');
}
