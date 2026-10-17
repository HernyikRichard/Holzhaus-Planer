import type { Mm, Opening, Plan, WallSide } from '../model/types';
import { frameLayout } from '../calc/frame';
import { beamSegments } from '../scene/frame';
import { studPositions, wallGeometry } from '../calc/geometry';
import {
  BATTEN_GAUGE, BEAM_BOLTS_PER_SUPPORT, BEAM_SECTIONS, BATTEN_SPACING_WALL, EPDM_UPTURN, MESH_SHEET, OSB_SCREW_EDGE_SPACING, OSB_SCREW_FIELD_SPACING,
} from '../catalog';
import type { Element, ElementKind, FastenerKind, Scene } from '../scene/types';
import { formatCm, formatCmNum, formatQty } from '../ui/format';
import type { AssemblyLine, AssemblyStep } from './steps';

const SIDE_NAMES: Record<WallSide, string> = { N: 'É', E: 'K', S: 'D', W: 'Ny' };
const MAX_POSITIONS = 12;
const MIN_TODO = 3;
const MAX_TODO = 6;

/** Kiegészítő teendők, ha a lépés adataiból háromnál kevesebb mondat jön ki; `{fel}` = a haladás iránya (`upward`). */
const FILLERS: Record<string, string[]> = {
  foundation: ['Ellenőrizd a lemez vízszintjét és az átlókat.', 'Locsold a betont az első napokban, és hagyd szilárdulni.'],
  supports: [],
  beamFrame: [],
  floor: ['Ellenőrizd a párnafák vízszintjét, szükség esetén alátéttel igazítsd.', 'Ellenőrizd a padló síkját vízmértékkel.'],
  wall: ['Ellenőrizd az átlókat: a váz legyen derékszögű.', 'Merevítsd ideiglenesen ferde léccel, amíg a szomszéd fal fel nem kerül.'],
  wallTop: ['Ellenőrizd az átlókat: a falak legyenek derékszögben és függőlegesek.', 'Csavarozd össze a sarkokat a szomszéd fallal.', 'Merevítsd ideiglenesen ferde léccel a falakat.'],
  roofFrame: ['Ellenőrizd zsinórral, hogy a szarufák egy síkban vannak.', 'Merevítsd ideiglenesen ferde léccel a tetővázat.'],
  roofLayers: ['Ellenőrizd, hogy a rétegek hézag és szakadás nélkül fedik a tetősíkot.', 'Az alsó rétegeket mindig {fel} haladva rakd.'],
  covering: ['Haladj {fel}, a csapadékkal ellentétes irányban átfedve.', 'Ellenőrizd az illesztéseket és az átfedéseket: sehol ne maradjon nyitott varrat.', 'Takarítsd le a tetőt a forgácstól és a hulladéktól.'],
  accessories: ['Ellenőrizd a csatlakozásokat és a rögzítéseket.', 'Ellenőrizd a víz elvezetését egy vödör vízzel.', 'Kezeld le a látszó fafelületeket.'],
  openings: ['Ékeld ki a tokokat, ellenőrizd vízmértékkel, majd rögzítsd a vázhoz.', 'Habosítsd ki a tok és a váz közti hézagot.', 'Ellenőrizd a nyitást és a zárást.'],
  exterior: ['Hagyd szabadon a szellőzőrést a burkolat alján és tetején.', 'Ellenőrizd a nyílások körüli csatlakozásokat.', 'Kezeld le a külső burkolatot.'],
  interior: ['Ellenőrizd, hogy a rétegek hézag nélkül fedik a falat.', 'Ragaszd le az illesztéseket és az áttöréseket.', 'Jelöld be a vázoszlopok helyét a burkolaton a későbbi rögzítéshez.'],
};

const KIND_NAMES: Partial<Record<ElementKind, string>> = {
  stud: 'oszlop', cornerStud: 'sarokoszlop', gableStud: 'oromoszlop', kingStud: 'teljes oszlop', jackStud: 'kiváltó oszlop',
  cripple: 'rövid oszlop', sill: 'könyöklő', header: 'áthidaló',
};

/** Névelő a szám (szöveg) elé: „az 1,62 m³”, „az 5 db”, „a 18 szarufát”. */
export function az(x: string | number): string {
  const t = String(x);
  const digits = /^\d[\d\s]*/.exec(t)?.[0].replace(/\D/g, '') ?? '';
  const vowel = digits ? digits[0] === '5' || (digits[0] === '1' && [1, 4, 7].includes(digits.length)) : /^[aáeéiíoóöőuúüű]/i.test(t);
  return `${vowel ? 'az' : 'a'} ${t}`;
}

/** Haladási irány a tetőn: nyeregtetőn a gerinc felé, gerinc nélkül (egyhajlású, lapos) felfelé. */
const upward = (plan: Plan): string => (plan.roof.shape === 'gable' ? 'az eresztől a gerinc felé' : 'az eresztől felfelé');

const qty = (l: AssemblyLine): string => `${formatQty(l.quantity)} ${l.unit}`;
const meters = (mm: Mm): string => (mm / 1000).toFixed(2).replace('.', ',');

/** „60 × 200 cm” */
const size = (w: Mm, h: Mm): string => `${formatCmNum(w)} × ${formatCm(h)}`;

function openingText(o: Opening, withWall: boolean): string {
  const type = o.type === 'door' ? 'ajtó' : 'ablak';
  const sill = o.type === 'window' && o.sillHeight > 0 ? `, ${formatCm(o.sillHeight)} parapettel` : '';
  return withWall
    ? `${type} ${size(o.width, o.height)} (${SIDE_NAMES[o.wall]} fal, ${formatCm(o.offset)}-nél)`
    : `${type} ${size(o.width, o.height)}, ${formatCm(o.offset)}-nél${sill}`;
}

/** Felsorolás: „a, b és c”. */
function list(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} és ${parts[parts.length - 1]}`;
}

interface Ctx { plan: Plan; step: AssemblyStep; els: Element[] }

const count = (c: Ctx, kind: ElementKind): number => c.els.filter(e => e.kind === kind).length;
const fasteners = (c: Ctx, kind: FastenerKind): number =>
  c.step.fasteners.filter(f => f.kind === kind).reduce((a, f) => a + f.count, 0);
const line = (c: Ctx, id: string): AssemblyLine | undefined => c.step.lines.find(l => l.lineId === id);
/** A lépés darabjai egy elemfajtára: „2 × 280 cm, 2 × 400 cm”. */
function pieceSizes(c: Ctx, kind: ElementKind): string {
  const kinds = new Map(c.els.map(e => [e.id, e.kind]));
  return c.step.pieces.filter(p => kinds.get(p.elementIds[0]) === kind)
    .sort((a, b) => a.length - b.length)
    .map(p => `${p.count} × ${formatCm(p.length)}`).join(', ');
}

function foundation(c: Ctx): string[] {
  const f = c.plan.foundation;
  const { width, length } = c.plan.building;
  const out = [`Zsaluzd ki ${az(meters(width + 2 * f.slabOverhang))} × ${meters(length + 2 * f.slabOverhang)} m-es lemezt, ${formatCm(f.slabThickness)} vastagon.`];
  if (f.gravelBedThickness > 0) out.push(`Terítsd el ${az(formatCm(f.gravelBedThickness))}-es sóderágyat, tömörítsd.`);
  const mesh = count(c, 'meshSheet');
  if (mesh > 0) {
    out.push(f.peFoil
      ? `Fektesd le a PE fóliát és ${az(mesh)} db hálótáblát ${formatCm(MESH_SHEET.overlap)} átfedéssel.`
      : `Fektesd le ${az(mesh)} db hálótáblát ${formatCm(MESH_SHEET.overlap)} átfedéssel, távtartókra.`);
  }
  const concrete = line(c, 'foundation.concrete');
  if (concrete) out.push(`Öntsd be ${az(qty(concrete))} betont (${f.concreteGrade}), tömörítsd és húzd le a zsalu szintjére.`);
  return out;
}

function supports(c: Ctx): string[] {
  const f = frameLayout(c.plan);
  const { groundScrew, frame } = c.plan.foundation;
  const n = count(c, 'support');
  return [
    `Tűzd ki a ${n} csavar helyét: ${f.beamAxes.length} sor ${formatCm(f.joistSpan)}-es sorközzel, soronként ${f.supportAxes.length} csavar a sarokponttól ${positions(f.supportAxes)}-re.`,
    `Hajtsd be a csavarokat ${formatCm(groundScrew.length)} mélyre, függőlegesen; a fejük ${formatCm(frame.groundClearance)}-re legyen a talaj fölött.`,
    'Szintezd ki az U-fejeket egy magasságra (lézer vagy vízmérték).',
  ];
}

function beamFrame(c: Ctx): string[] {
  const f = frameLayout(c.plan);
  const out = [`Fektesd ${az(f.beamAxes.length)} főgerendát az U-fejekbe, rögzítsd fejenként ${BEAM_BOLTS_PER_SUPPORT} db M12 menetes szárral.`];
  if (BEAM_SECTIONS[c.plan.foundation.frame.beamSection].plies === 2) out.push('A 2×50×150-es főgerenda két összeszegezett pallóból áll.');
  // toldott gerenda: egy főgerendához több szegmens tartozik
  if (beamSegments(f.L, f.supportAxes, c.plan.settings.stockLengths).length > 1) out.push('A toldás mindig támasz fölé essen.');
  out.push('Ellenőrizd, hogy a főgerendák felső síkja egy szintben van; szükség esetén állíts az U-fejeken.');
  out.push('Ellenőrizd az átlókat: a keret derékszögű legyen.');
  return out;
}

function floor(c: Ctx): string[] {
  const fl = c.plan.floor;
  const out: string[] = [];
  const joists = c.els.filter(e => e.kind === 'joist').sort((a, b) => a.geom.u - b.geom.u);
  if (c.plan.foundation.type === 'groundScrew' && joists.length) {
    out.push(`Fektesd ${az(joists.length)} párnafát ${formatCm(fl.joistSpacing)}-es kiosztással a főgerendákra, a két szélső párnafa a peremgerenda, a rövid falak alatt fut.`);
    out.push(`Rögzítsd minden kereszteződést gerendasaruval (${fasteners(c, 'joistHanger')} db).`);
  } else if (joists.length) {
    const u0 = joists[0].geom.u;
    out.push(`Fektesd le ${az(joists.length)} párnafát (${formatCm(joists[0].length)}) ${formatCm(fl.joistSpacing)}-es kiosztással; `
      + `a helyük az első párnafától: ${positions(joists.map(j => j.geom.u - u0))}.`);
  }
  const ins = line(c, 'floor.insulation');
  if (ins) out.push(`Töltsd ki a párnafák közét hőszigeteléssel (${qty(ins)}), hézag nélkül.`);
  const vb = line(c, 'floor.vaporBarrier');
  if (vb) out.push(`Terítsd le a párazáró fóliát (${qty(vb)}) átfedéssel, az illesztéseket ragaszd le.`);
  const osb = line(c, 'floor.osb');
  if (osb) out.push(`Csavarozd fel ${az(fl.osbThickness)} mm-es padló-OSB-t (${qty(osb)}) a párnafákra, az illesztések párnafára essenek.`);
  return out;
}

/** „0, 60, 120, …, 395 cm” helyett legfeljebb 12 szám, utána „…”. */
function positions(mm: Mm[]): string {
  const nums = mm.map(formatCmNum);
  return `${nums.length > MAX_POSITIONS ? `${nums.slice(0, MAX_POSITIONS).join(', ')}, …` : nums.join(', ')} cm`;
}

function wall(c: Ctx, side: WallSide): string[] {
  const w = wallGeometry(c.plan).find(x => x.side === side)!;
  const out = [`Fektesd le a talpgerendát (${formatCm(w.length)}), jelöld be az oszlophelyeket a fal elejétől: ${positions(studPositions(c.plan, w))}.`];
  const parts = (['stud', 'cornerStud', 'gableStud'] as ElementKind[])
    .map(k => [k, count(c, k)] as const).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_NAMES[k]}`);
  const ops = c.plan.openings.filter(o => o.wall === side).sort((a, b) => a.offset - b.offset);
  if (ops.length) parts.push(`${ops.length} nyílás (${ops.map(o => openingText(o, false)).join('; ')})`);
  const screws = fasteners(c, 'frameScrew');
  out.push(`Szereld össze a vázat a földön${screws ? ` ${screws} vázszerkezeti csavarral` : ''}: ${parts.join(', ')}.`);
  if (ops.length) {
    const frame = (['kingStud', 'jackStud', 'header', 'sill', 'cripple'] as ElementKind[])
      .map(k => [k, count(c, k)] as const).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_NAMES[k]}`);
    if (frame.length) out.push(`Építsd be a nyílás${ops.length > 1 ? 'ok' : ''} keretét: ${list(frame)}.`);
  }
  const anchors = fasteners(c, 'anchor');
  const full = w.full ? '' : ' a futó falak közé, csavarozd a sarkokhoz';
  out.push(`Állítsd fel${full}, függőzd ki, ${anchors ? `rögzítsd ${anchors} db ászokcsavarral` : 'rögzítsd a talpgerendát az alaphoz'}.`);
  return out;
}

function wallTop(c: Ctx): string[] {
  const out: string[] = [];
  const plates = pieceSizes(c, 'topPlate');
  if (plates) out.push(`Rakd fel a felső koszorút (${plates}) a sarkoknál átlapolva, csavarozd az alsóhoz.`);
  out.push('Ellenőrizd az átlókat: a falak legyenek derékszögben és függőlegesek.');
  const osb = line(c, 'wall.osb');
  const layer = c.plan.walls.layers.find(l => l.kind === 'osb');
  if (osb) out.push(`Burkold kívülről a falakat ${layer?.thickness ? `${layer.thickness} mm-es ` : ''}OSB-lappal (${qty(osb)}), a nyílásokat vágd ki.`);
  const screws = fasteners(c, 'osbScrew');
  if (screws) out.push(`Csavarozd fel ${screws} db OSB-csavarral: a széleken ${formatCm(OSB_SCREW_EDGE_SPACING)}-enként, a mezőben ${formatCm(OSB_SCREW_FIELD_SPACING)}-enként.`);
  return out;
}

function roofFrame(c: Ctx): string[] {
  const r = c.plan.roof;
  const out: string[] = [];
  const ridge = c.els.find(e => e.kind === 'ridge');
  if (ridge) out.push(`Emeld fel és támaszd alá a gerincpallót (${formatCm(ridge.length)}).`);
  const rafters = count(c, 'rafter');
  const ties = fasteners(c, 'hurricaneTie');
  const tieText = ties === 0 ? '' : ties % rafters === 0 ? `, mindegyiket ${ties / rafters} viharkapoccsal` : `, összesen ${ties} viharkapoccsal`;
  if (rafters) out.push(`Rakd fel ${az(rafters)} szarufát ${formatCm(r.rafterSpacing)}-es kiosztással${tieText}.`);
  const collars = count(c, 'collar');
  const screws = fasteners(c, 'frameScrew');
  if (collars) {
    out.push(`Csavarozd fel ${az(collars)} fogópárt (${pieceSizes(c, 'collar')}) a szarufákra${screws ? ` ${screws} vázszerkezeti csavarral` : ''}.`);
  } else if (screws) out.push(`Csavarozd össze a tetővázat ${screws} vázszerkezeti csavarral.`);
  out.push('Ellenőrizd zsinórral, hogy a szarufák egy síkban vannak.');
  return out;
}

function roofLayers(c: Ctx): string[] {
  const out: string[] = [];
  const decking = line(c, 'roof.decking');
  if (decking) out.push(`Rakd fel a deszkázatot a szarufákra (${qty(decking)}).`);
  const underlay = line(c, 'roof.underlay');
  if (underlay) out.push(`Terítsd le az alátétréteget (${qty(underlay)}) ${upward(c.plan)}, átfedéssel.`);
  const counters = count(c, 'counterBatten');
  if (counters) out.push(`Szegezd fel ${az(counters)} ellenlécet a szarufák vonalában.`);
  const battens = count(c, 'roofBatten');
  const gauge = BATTEN_GAUGE[c.plan.roof.covering];
  if (battens) out.push(`Szegezd fel ${az(battens)} tetőlécet${gauge ? ` ${formatCm(gauge)}-es lécközzel` : ''}, az eresztől kezdve.`);
  return out;
}

function covering(c: Ctx): string[] {
  const out: string[] = [];
  const l = (id: string) => line(c, id);
  const tiles = l('roof.tiles');
  if (tiles) out.push(`Rakd fel ${az(qty(tiles))} cserepet soronként, ${upward(c.plan)}.`);
  const clips = l('fix.tileClips');
  if (clips) out.push(`Rögzítsd a cserepeket cserépkapoccsal az eresznél és az oromnál (${qty(clips)}).`);
  const trap = l('roof.trapezoid');
  if (trap) out.push(`Csavarozd fel ${az(qty(trap))} trapézlemezt a tetőlécekre, oldalt egy hullám átfedéssel.`);
  const sh = l('roof.shingles');
  if (sh) out.push(`Szegezd fel a bitumenes zsindelyt (${qty(sh)}) a deszkázatra, az eresztől soronként.`);
  const epdm = l('roof.epdm');
  if (epdm) out.push(`Terítsd ki és ragaszd le az EPDM-lemezt (${qty(epdm)}), a széleken ${formatCm(EPDM_UPTURN)} felhajtással.`);
  const seam = l('roof.standingSeam');
  if (seam) out.push(`Rakd fel ${az(qty(seam))} állókorcos sávot az eresztől ${c.plan.roof.shape === 'gable' ? 'a gerincig' : 'a felső szélig'}.`);
  const sc = l('fix.seamClips');
  const scs = l('fix.seamClipScrews');
  if (sc) out.push(`Rögzítsd a sávokat ${qty(sc)} klipsszel${scs ? ` (${qty(scs)} csavar)` : ''}, majd zárd a korcokat.`);
  const flash = [l('roof.seamEaveFlashing') && `az ereszszegélyt (${qty(l('roof.seamEaveFlashing')!)})`,
    l('roof.seamRakeFlashing') && `az oromszegélyt (${qty(l('roof.seamRakeFlashing')!)})`].filter((x): x is string => !!x);
  if (flash.length) out.push(`Szereld fel ${list(flash)}.`);
  const vent = l('acc.ridgeVent');
  const ridge = l('acc.ridgeTiles');
  const cap = l('acc.ridgeCap');
  if (ridge) out.push(`Rakd fel ${az(qty(ridge))} gerinccserepet${vent ? ` a gerincszellőző-szalagra (${qty(vent)})` : ''}.`);
  else if (cap) out.push(`Szereld fel a gerincfedőt (${qty(cap)})${vent ? ` a gerincszellőző-szalaggal (${qty(vent)})` : ''}.`);
  else if (vent) out.push(`Fektesd le a gerincszellőző-szalagot (${qty(vent)}).`);
  return out;
}

function accessories(c: Ctx): string[] {
  const out: string[] = [];
  const fascia = count(c, 'fascia');
  if (fascia) out.push(`Szereld fel ${az(fascia)} homlokdeszkát (${pieceSizes(c, 'fascia')}) a szarufavégekre.`);
  const barge = count(c, 'barge');
  if (barge) out.push(`Szereld fel ${az(barge)} oromdeszkát (${pieceSizes(c, 'barge')}) a tetősík szélére.`);
  const gutter = line(c, 'acc.gutter');
  const brackets = line(c, 'acc.gutterBrackets');
  if (brackets) out.push(`Szereld fel ${az(qty(brackets))} csatornatartót lejtéssel a lefolyó felé.`);
  if (gutter) out.push(`Pattintsd be az ereszcsatornát (${qty(gutter)}) a végelemekkel és a toldókkal.`);
  const pipe = line(c, 'acc.downpipe');
  if (pipe) {
    const elbows = line(c, 'acc.downpipeElbows');
    const clipsL = line(c, 'acc.downpipeClips');
    const extra = [elbows && `${qty(elbows)} könyökkel`, clipsL && `${qty(clipsL)} bilinccsel`].filter((x): x is string => !!x);
    out.push(`Szereld fel ${az(qty(pipe))} lefolyócsövet${extra.length ? ` ${list(extra)}` : ''}.`);
  }
  return out;
}

function openings(c: Ctx): string[] {
  const ids = new Set(c.els.filter(e => e.kind === 'opening').map(e => e.openingId));
  const ops = c.plan.openings.filter(o => ids.has(o.id));
  if (!ops.length) return [];
  return [`Építsd be ${az(ops.length)} nyílászárót: ${ops.map(o => openingText(o, true)).join(', ')}.`];
}

function exterior(c: Ctx): string[] {
  const out: string[] = [];
  const bm = line(c, 'wall.breatherMembrane');
  if (bm) out.push(`Feszítsd fel kívülről a szélzáró fóliát (${qty(bm)}) átfedéssel, tűzőgéppel.`);
  const battens = c.step.pieces.filter(p => p.elementIds[0]?.startsWith('wall.batten.')).reduce((a, p) => a + p.count, 0);
  if (battens) out.push(`Szegezd fel ${az(battens)} lécet függőlegesen, ${formatCm(BATTEN_SPACING_WALL)}-enként a vázoszlopokra.`);
  const cl = line(c, 'wall.exteriorCladding');
  const nails = line(c, 'fix.claddingNails');
  if (cl) out.push(`Szereld fel a külső burkolatot (${qty(cl)})${nails ? `, ${qty(nails)} burkolatszeggel` : ''}.`);
  return out;
}

function interior(c: Ctx): string[] {
  const out: string[] = [];
  const ins = line(c, 'wall.insulation');
  if (ins) out.push(`Tömd ki a vázat a hőszigeteléssel (${qty(ins)}), hézag nélkül.`);
  const vb = line(c, 'wall.vaporBarrier');
  if (vb) out.push(`Feszítsd fel belülről a párazáró fóliát (${qty(vb)}), az illesztéseket ragaszd le.`);
  const cl = line(c, 'wall.interiorCladding');
  // az OSB-csavar sora csak OSB burkolatnál a belső burkolaté (lásd stepIdOfLine)
  const osb = c.plan.walls.layers.some(l => l.kind === 'interiorCladding' && l.enabled && l.material === 'osb');
  const screws = osb ? line(c, 'fix.osbScrews') : undefined;
  if (cl) out.push(`Szereld fel a belső burkolatot (${qty(cl)})${screws ? `, ${qty(screws)} OSB-csavarral` : ''}.`);
  return out;
}

/** A lépés 3–6 rövid teendője a terv és a lépés számaival (felszólító mód). */
export function stepTodo(plan: Plan, scene: Scene, step: AssemblyStep): string[] {
  const ids = new Set(step.elementIds);
  const c: Ctx = { plan, step, els: scene.elements.filter(e => ids.has(e.id)) };
  let out: string[];
  let key: string = step.id;
  switch (step.id) {
    case 'foundation': out = foundation(c); break;
    case 'supports': out = supports(c); break;
    case 'beamFrame': out = beamFrame(c); break;
    case 'floor': out = floor(c); break;
    case 'wall.N': case 'wall.E': case 'wall.S': case 'wall.W':
      out = wall(c, step.id.slice(5) as WallSide); key = 'wall'; break;
    case 'wallTop': out = wallTop(c); break;
    case 'roofFrame': out = roofFrame(c); break;
    case 'roofLayers': out = roofLayers(c); break;
    case 'covering': out = covering(c); break;
    case 'accessories': out = accessories(c); break;
    case 'openings': out = openings(c); break;
    case 'exterior': out = exterior(c); break;
    case 'interior': out = interior(c); break;
  }
  for (const f of FILLERS[key].map(x => x.replace('{fel}', upward(plan)))) {
    if (out.length >= MIN_TODO) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, MAX_TODO);
}
