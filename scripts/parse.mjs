// Káplár Fatelep terméknév-értelmező. Tiszta ESM JavaScript (Node-on build nélkül fut),
// a típusait a parse.d.ts adja a TypeScript-tesztekhez.
//
// Product.id séma: '<kind>-<méretek>' + opcionális változat-utótag, kisbetűs, ékezet nélkül:
//   timber      timber-<vastagság>x<szélesség>-<hossz>         mm-ben   (timber-50x150-4000)
//               + '-szaritott' ha a név „szárított"
//   osb         osb-<vastagság>[-<szél>x<hossz>]               (osb-12-1250x2500, osb-12)
//               + '-nutfeder' ha nútféderes
//   insulation  insulation-<anyag>-<vastagság>                 (insulation-kozetgyapot-100)
//   foil        foil-<típus>-<tekercs m²>                      (foil-parazaro-75)
//   cladding    cladding-<anyag>-<vastagság>x<szélesség>-<hossz> (cladding-lamberia-14x121-4000)
//   roofing | gutter | fastener   <kind>-<a név rövid slugja>
// Ha két különböző termék azonos id-t kapna (pl. két gyártó azonos méretben), a hívó (letöltő)
// feladata a név slugjának (slug()) hozzáfűzése.

const NUM = '\\d+(?:[.,]\\d+)?';

/**
 * Magyar számformátum: „5 670" -> 5670, „5,4" -> 5.4, „14.500" -> 14500. Érvénytelen: NaN.
 * Ezres tagoló: szóköz/nbsp, vagy pont, ha pontosan 3 számjegyes csoportok követik (`14.500` -> 14500);
 * egyébként a vessző (és az egyetlen pont) tizedesjel. */
export function parseHuNumber(s) {
  let t = String(s).replace(/[\s  ]/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ékezet nélküli, kötőjeles, rövid azonosító a névből. */
export function slug(s) {
  return fold(s).replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

/** HTML-entitások, a webshop címkeutótagja és a felesleges szóközök eltávolítása. */
export function cleanName(raw) {
  return String(raw)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+-\s+Országos kiszállítás.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectKind(f, url) {
  if (/csatorna|lefolyo|kifolyo/.test(f)) return 'gutter';
  if (/csavar|szeg(?!ely)|kapocs/.test(f)) return 'fastener';
  if (/folia|paraatereszto|parazaro/.test(f)) return 'foil';
  if (/kozetgyapot|uveggyapot|asvanygyapot|unifit|(^|[^a-z])(xps|eps)([^a-z]|$)/.test(f)) return 'insulation';
  if (/hoszigetel/.test(fold(url)) && !/lec|deszka/.test(f)) return 'insulation';
  if (/(^|[^a-z])osb([^a-z]|$)/.test(f)) return 'osb';
  if (/lamberia|hajopadlo/.test(f)) return 'cladding';
  if (/cserep|trapez|zsindely/.test(f)) return 'roofing';
  if (/pallo|padlo|deszka|szarufa|gerenda|stafni|(^|[^a-z])(teto)?lec/.test(f)) return 'timber';
  return null;
}

const FACTOR = { mm: 1, cm: 10, m: 1000 };
const r1 = (v) => Math.round(v * 10) / 10;

/** AxBxC keresztmetszet + hossz mm-ben; „2,3-2,5x15x400" esetén a nagyobb vastagság. */
function parseTriple(name, defaultUnit) {
  const m = new RegExp(`(${NUM})(?:\\s*-\\s*(${NUM}))?\\s*[x×]\\s*(${NUM})\\s*[x×]\\s*(${NUM})\\s*(mm|cm|m)?(?![a-zA-Z])`, 'i').exec(name);
  if (m) {
    const a = Math.max(parseHuNumber(m[1]), m[2] ? parseHuNumber(m[2]) : 0);
    const b = parseHuNumber(m[3]);
    const c = parseHuNumber(m[4]);
    const suffix = m[5] && m[5].toLowerCase();
    // Jelölés nélkül: ha mindkét keresztmetszeti szám >= 20, mm (pl. 45x95x4000), különben cm.
    const unmarked = defaultUnit === 'auto' ? (a >= 20 && b >= 20 ? 'mm' : 'cm') : defaultUnit;
    // Az 'm' végződés csak a hosszra vonatkozik; a keresztmetszet marad az alapegységben.
    const fs = FACTOR[suffix && suffix !== 'm' ? suffix : unmarked];
    const fl = FACTOR[suffix || unmarked];
    return { a: r1(a * fs), b: r1(b * fs), c: r1(c * fl) };
  }
  const s = new RegExp(`(${NUM})\\s*/\\s*(${NUM})\\s+(${NUM})\\s*m(?![a-zA-Z])`, 'i').exec(name); // „3/5 4m"
  if (s) {
    return { a: r1(parseHuNumber(s[1]) * 10), b: r1(parseHuNumber(s[2]) * 10), c: r1(parseHuNumber(s[3]) * 1000) };
  }
  return null;
}

/** Hihető faanyag-/burkolatméret (mm): vastagság minT..300, szélesség 15..400, hossz 300..13000. */
function plausible(d, minT) {
  return d.a >= minT && d.a <= 300 && d.b >= 15 && d.b <= 400 && d.c >= 300 && d.c <= 13000;
}

function normalizeUnit(unitText) {
  const t = String(unitText ?? '');
  const u = fold(t.includes('/') ? t.slice(t.lastIndexOf('/') + 1) : t).replace(/[^a-z0-9]/g, '');
  switch (u) {
    case 'tabla': return 'tábla';
    case 'csomag': case 'cs': return 'csomag';
    case 'tekercs': case 'tek': return 'tekercs';
    case 'm2': case 'negyzetmeter': return 'm²';
    case 'fm': case 'meter': case 'm': return 'fm';
    case 'doboz': case 'dob': return 'doboz';
    case '': case 'db': case 'szal': return 'db';
    default: return null; // ismeretlen egység (pl. kg) -> a termék nem értelmezhető
  }
}

const num = (re, s) => {
  const m = re.exec(s);
  return m ? parseHuNumber(m[1]) : undefined;
};

/**
 * @param {{ name: string, url: string, price: number, unitText: string }} input
 * @returns {import('../src/prices/types').Product | null}
 */
export function parseProduct({ name: rawName, url, price, unitText }) {
  const name = cleanName(rawName);
  if (!name || !Number.isFinite(price) || price <= 0) return null;
  const f = fold(name);
  const kind = detectKind(f, url ?? '');
  if (!kind) return null;

  const unit = normalizeUnit(unitText);
  if (unit === null) return null;
  const p = { id: '', name, url, kind, price, unit };
  const packM2 = num(new RegExp(`(${NUM})\\s*m[²2]\\s*/\\s*(?:cs|csomag)`, 'i'), name);

  switch (kind) {
    case 'timber': {
      // nem faanyag: burkolatok, tartók, lapok
      if (/laminalt|parketta|padlolap|burkolat|tarto|saru|(^|[^a-z])lap([^a-z]|$)/.test(f)) return null;
      const d = parseTriple(name, 'auto');
      if (!d || !plausible(d, 15)) return null;
      p.section = { t: d.a, w: d.b }; p.length = d.c;
      p.id = `timber-${d.a}x${d.b}-${d.c}${/szaritott/.test(f) ? '-szaritott' : ''}`;
      break;
    }
    case 'osb': {
      const d = parseTriple(name, 'mm');
      const thickness = d && d.a <= 60 && d.b >= 300 ? d.a : num(new RegExp(`(${NUM})\\s*mm`, 'i'), name);
      if (thickness === undefined) return null;
      p.thickness = thickness;
      const pair = d && d.a <= 60 ? { w: d.b, l: d.c } : /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(name);
      if (pair) {
        const [x, y] = Array.isArray(pair) ? [Number(pair[1]), Number(pair[2])] : [pair.w, pair.l];
        p.sheet = { w: Math.min(x, y), l: Math.max(x, y) };
      }
      if (p.unit === 'db') p.unit = 'tábla';
      p.id = `osb-${thickness}${p.sheet ? `-${p.sheet.w}x${p.sheet.l}` : ''}${/nutfeder/.test(f) ? '-nutfeder' : ''}`;
      break;
    }
    case 'insulation': {
      const m = new RegExp(`(${NUM})\\s*(cm|mm)(?![a-zA-Z])`, 'i').exec(name);
      if (!m) return null;
      p.thickness = r1(parseHuNumber(m[1]) * FACTOR[m[2].toLowerCase()]);
      const mat = /kozetgyapot/.test(f) ? 'kőzetgyapot'
        : /uveggyapot|unifit/.test(f) ? 'üveggyapot'
        : /asvanygyapot/.test(f) ? 'ásványgyapot'
        : /(^|[^a-z])xps([^a-z]|$)/.test(f) ? 'XPS'
        : /(^|[^a-z])eps([^a-z]|$)/.test(f) ? 'EPS' : undefined;
      if (mat) p.material = mat;
      p.id = ['insulation', mat && fold(mat), p.thickness].filter((x) => x !== undefined).join('-');
      if (packM2 !== undefined) p.packM2 = packM2;
      break;
    }
    case 'foil': {
      const rollM2 = num(new RegExp(`(${NUM})\\s*m[²2]`, 'i'), name);
      if (rollM2 !== undefined) p.rollM2 = rollM2;
      const type = /parazaro/.test(f) ? 'parazaro' : /paraatereszto/.test(f) ? 'paraatereszto' : 'folia';
      p.id = ['foil', type, rollM2].filter((x) => x !== undefined).join('-');
      break;
    }
    case 'cladding': {
      const d = parseTriple(name, 'mm');
      if (!d || !plausible(d, 8)) return null; // lambéria lehet 8-9 mm vastag
      const mat = /hajopadlo/.test(f) ? 'hajópadló' : 'lambéria';
      p.material = mat; p.section = { t: d.a, w: d.b }; p.length = d.c; p.thickness = d.a;
      if (packM2 !== undefined) p.packM2 = packM2;
      p.id = `cladding-${fold(mat)}-${d.a}x${d.b}-${d.c}`;
      break;
    }
    default: { // roofing, gutter, fastener
      if (packM2 !== undefined) p.packM2 = packM2;
      const box = num(/(\d+)\s*db\s*\/\s*dob/i, name);
      if (kind === 'fastener' && box !== undefined) p.boxQty = box;
      p.id = `${kind}-${slug(name)}`;
    }
  }
  return p;
}
