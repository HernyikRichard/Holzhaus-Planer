import type { CalcStats, MaterialLine } from './types';
import {
  CLADDING_NAILS_PER_M2, COUNTER_BATTEN_NAIL_SPACING, FASTENER_BOX, FRAME_SCREWS_PER_END, HURRICANE_TIE_LABEL,
  SCREWS_PER_OSB_SHEET,
} from '../catalog';
import { hu } from './util';

export function calcFasteners(stats: CalcStats): MaterialLine[] {
  const lines: MaterialLine[] = [];
  const box = (id: string, name: string, pieces: number, boxSize: number, explanation: string): void => {
    if (pieces <= 0) return;
    const qty = Math.ceil(pieces / boxSize - 1e-9);
    lines.push({
      id, category: 'Kötőelemek', name, quantity: qty, unit: 'doboz', secondary: `${pieces} db`,
      explanation: `${explanation} = ${pieces} db / ${boxSize} db/doboz = ${hu(pieces / boxSize, 3)} → ${qty} doboz`,
    });
  };

  if (stats.anchorPoints > 0) {
    lines.push({
      id: 'fix.anchors', category: 'Kötőelemek', name: 'Talpgerenda-rögzítő (dübel / ászokcsavar)',
      quantity: stats.anchorPoints, unit: 'db',
      explanation: `${stats.anchorPoints} rögzítési pont a talpgerenda mentén (800 mm-enként, sarkoknál és nyílászáróknál pótlással)`,
    });
  }
  box('fix.frameScrews', 'Vázszerkezeti csavar', stats.frameScrewCount, FASTENER_BOX.frameScrew,
    `${hu(stats.frameScrewCount / FRAME_SCREWS_PER_END, 0)} rögzítési pont a vázon (elemvégenként ${FRAME_SCREWS_PER_END} db)`);
  const osbPieces = stats.osbScrewCount + stats.osbSheets * SCREWS_PER_OSB_SHEET;
  box('fix.osbScrews', 'OSB-csavar', osbPieces, FASTENER_BOX.osbScrew,
    `${stats.osbScrewCount} db a falak kiosztásából + ${stats.osbSheets} tábla × ${SCREWS_PER_OSB_SHEET} db`);
  if (stats.hurricaneTieCount > 0) {
    lines.push({
      id: 'fix.hurricaneTies', category: 'Kötőelemek', name: HURRICANE_TIE_LABEL,
      quantity: stats.hurricaneTieCount, unit: 'db',
      explanation: `${stats.hurricaneTieCount} rögzítési pont (szarufavégenként 1 db: a koszorún és a gerincnél / magas oldalon)`,
    });
  }
  box('fix.counterBattenNails', 'Ellenlécszeg',
    stats.counterBattenLength > 0 ? Math.ceil(stats.counterBattenLength / COUNTER_BATTEN_NAIL_SPACING - 1e-9) : 0,
    FASTENER_BOX.counterBattenNail,
    `⌈${hu(stats.counterBattenLength / 1000)} m ellenléc / ${hu(COUNTER_BATTEN_NAIL_SPACING / 1000)} m⌉`);
  box('fix.battenNails', 'Tetőlécszeg', stats.battenCrossings, FASTENER_BOX.battenNail,
    `${stats.battenCrossings} léc–ellenléc kereszteződés × 1 szeg`);
  box('fix.tileClips', 'Cserépkapocs', stats.tileClips, FASTENER_BOX.tileClip,
    `${stats.tileClips} kapocs az eresz menti és a szélső sorokba`);
  box('fix.claddingNails', 'Burkolatszeg', Math.ceil(stats.claddingArea * CLADDING_NAILS_PER_M2 - 1e-9), FASTENER_BOX.claddingNail,
    `${hu(stats.claddingArea, 2)} m² × ${CLADDING_NAILS_PER_M2} db/m²`);
  return lines;
}
