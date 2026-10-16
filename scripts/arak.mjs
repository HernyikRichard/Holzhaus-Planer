// Káplár Fatelep árlista-letöltő: `npm run arak`. A sitemapből kiválasztott termékoldalakat
// udvariasan (egyesével, >= 800 ms szünettel) letölti, és megírja a src/prices/kaplar.json-t.
// Ha a hibás oldalak aránya > 20%, nem ír fájlt, és 1-es kóddal kilép.
// Hibás oldal = hálózati/HTTP hiba vagy feldolgozhatatlan HTML. Az ár nélküli oldal és a
// parseProduct null eredménye nem hiba, hanem a kihagyott tételek jelentésébe kerül.
// Védelem: ha az új lista < 150 termék, vagy a meglévő kaplar.json termékszámának < 70%-a,
// nem ír fájlt (pl. oldalszerkezet-változás), 1-es kóddal kilép.
// ARAK_LIMIT=N: csak az első N oldalt tölti le, és a src/prices/kaplar.partial.json-ba ír
// (git-ignorált), a termelési fájlt és a védelmet nem érinti.
import { gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseProduct, parseHuNumber, cleanName, slug, roofingSheetFromText } from './parse.mjs';

const BASE = 'https://kaplarfatelep.hu';
const OUT = fileURLToPath(new URL('../src/prices/kaplar.json', import.meta.url));
const OUT_PARTIAL = fileURLToPath(new URL('../src/prices/kaplar.partial.json', import.meta.url));
const TIMEOUT_MS = 20000;
const MIN_PRODUCTS = 150;
const MIN_KEEP_RATIO = 0.7;
const DELAY_MS = 800;
const MAX_FAIL_RATIO = 0.2;
const KEYWORDS = ['fenyo-fureszaru', 'pallo', 'lec', 'deszk', 'szaruf', 'gerend', 'tetolec', 'osb', 'hoszigetel',
  'kozetgyapot', 'uveggyapot', 'tetofed', 'cserep', 'trapez', 'zsindely', 'folia', 'eresz', 'csatorna',
  'csavar', 'szeg', 'lamberia'];
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html',
  'Accept-Language': 'hu-HU,hu',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jar = new Map();

function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

/** Egyszerű GET sütitárolóval; az átirányításokat kézzel követi, hogy a sütik megmaradjanak. */
async function get(url) {
  let u = url;
  for (let hop = 0; hop < 5; hop++) {
    if (u.includes('/shop_ajax/')) throw new Error('shop_ajax tiltott');
    const headers = { ...HEADERS };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(u, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    storeCookies(res);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = new URL(res.headers.get('location'), u).href;
      await sleep(DELAY_MS);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('túl sok átirányítás');
}

/** get() egyszeri újrapróbálással: 429/503 -> 5 s várakozás, hálózati hiba/időtúllépés/5xx -> 2 s; egyéb 4xx azonnali hiba. */
async function getRetry(url) {
  try { return await get(url); } catch (e) {
    const m = /^HTTP (\d+)/.exec(e.message);
    const code = m ? Number(m[1]) : 0;
    if (code === 429 || code === 503) await sleep(5000);
    else if (code >= 400 && code < 500) throw e;
    else await sleep(2000);
    return await get(url);
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function collectUrls() {
  const index = (await get(`${BASE}/sitemap.xml`)).toString('utf8');
  const urls = new Set();
  const maps = locs(index);
  for (const m of maps) {
    await sleep(DELAY_MS);
    let buf = await get(m);
    if (m.endsWith('.gz')) buf = gunzipSync(buf);
    for (const u of locs(buf.toString('utf8'))) urls.add(u);
  }
  const all = [...urls];
  const selected = all.filter((u) => {
    const path = decodeURIComponent(new URL(u).pathname).toLowerCase();
    return KEYWORDS.some((k) => path.includes(k));
  });
  console.log(`Sitemap: ${maps.length} fájl, ${all.length} URL, ebből kiválasztva ${selected.length}`);
  return selected;
}

const textOf = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

/** Oldal -> { name, price, unitText, areaPerPiece?, text } vagy { error } / { name, noPrice }.
 * Az oldal két árat mutat: az első „N Ft / egység" sort és a „Bruttó: M Ft / egység <szorzó>" sort;
 * a kettő más egységben van (pl. OSB: 7 090 Ft / db és Bruttó 2 269 Ft / m² 3.125; léc: 349 Ft / méter
 * és Bruttó 1 396 Ft / db). A darab jellegű egységű (db/csomag/tekercs/doboz/tábla) árat választjuk;
 * ha a másik ár m²-es, belőle (szorzó vagy hányados) lesz a darabonkénti terület. */
const PIECE = new Set(['db', 'csomag', 'tekercs', 'doboz', 'tabla', 'tábla', 'cs']);
const isPiece = (u) => PIECE.has(u.toLowerCase());
const isM2 = (u) => /^m[²2]$/i.test(u);

export function extract(html) {
  const h1 = /<h1(?![^>]*hidden)[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1) return { error: 'nincs <h1>' };
  const name = cleanName(h1[1].replace(/<[^>]*>/g, ' '));
  if (!name) return { error: 'üres <h1>' };
  const text = textOf(html);
  const at = text.indexOf(name);
  const near = at >= 0 ? text.slice(at, at + 5000) : text.slice(0, 5000);
  const bi = text.indexOf('Bruttó:');
  if (bi >= 0) {
    const bm = /Bruttó:\s*([\d\s ]+?)\s*Ft\s*\/\s*([\p{L}²\d]+)\s*([\d.,]+)?/u.exec(text.slice(bi));
    const brutto = bm && parseHuNumber(bm[1]) > 0
      ? { price: parseHuNumber(bm[1]), unit: bm[2], factor: bm[3] ? Number(bm[3].replace(',', '.')) : NaN } : null;
    let first = null;
    for (const m of text.slice(Math.max(0, bi - 150), bi).matchAll(/(\d[\d\s ]*?)\s*Ft\s*\/\s*([\p{L}²\d]+)/gu)) {
      first = { price: parseHuNumber(m[1]), unit: m[2] };
    }
    if (first && !(first.price > 0)) first = null;
    if (brutto) {
      let main = brutto; let other = first;
      if (first && isPiece(first.unit)) { main = first; other = brutto; }
      else if (isPiece(brutto.unit)) { main = brutto; other = first; }
      else if (first && !isM2(first.unit) && isM2(brutto.unit)) { main = first; other = brutto; }
      const r = { name, price: main.price, unitText: main.unit, text: near };
      if (other && isM2(other.unit) && !isM2(main.unit)) {
        const f = other === brutto && other.factor > 0.5 ? other.factor : Math.round((main.price / other.price) * 100) / 100;
        if (f > 0) r.areaPerPiece = f;
      }
      return r;
    }
  }
  const j = /"price"\s*:\s*"(\d+)"/.exec(html);
  if (bi < 0 && j && Number(j[1]) > 0) return { name, price: Number(j[1]), unitText: 'db', text: near };
  return { name, noPrice: true };
}

/** A névből nem kinyerhető jellemzők az oldalról. Visszaadja, mi lett alapértékkel pótolva. */
export function enrich(p, text, areaPerPiece) {
  const notes = [];
  const n = (m) => parseHuNumber(m[1]);
  if (p.kind === 'osb' && !p.sheet) {
    if (areaPerPiece === 3.125) p.sheet = { w: 1250, l: 2500 };
    else if (areaPerPiece > 0.5 && areaPerPiece < 3) { // pl. nútféderes: 1,6875 m² -> 675 x 2500 (az oldal m²/tábla értékéből)
      p.sheet = { w: Math.round((areaPerPiece / 2.5) * 1000), l: 2500 };
      notes.push(`lapméret az oldal ${areaPerPiece} m²/tábla értékéből: ${p.sheet.w}x2500`);
    } else {
      p.sheet = { w: 1250, l: 2500 };
      notes.push(`alapértelmezett 1250x2500 lap (az oldal szerint ${areaPerPiece ?? '?'} m²/tábla)`);
    }
    p.id = `osb-${p.thickness}-${p.sheet.w}x${p.sheet.l}${/nutfeder/.test(slug(p.name)) ? '-nutfeder' : ''}`;
  }
  if (['insulation', 'cladding', 'roofing'].includes(p.kind) && p.packM2 === undefined) {
    const m = /(\d+(?:[.,]\d+)?)\s*m[²2]\s*\/\s*(?:csomag|cs\b|bála|bala|tekercs)/i.exec(text);
    if (areaPerPiece && p.unit !== 'm²') p.packM2 = areaPerPiece;
    else if (m) p.packM2 = n(m);
  }
  if (p.kind === 'roofing' && /trapéz/i.test(p.name)) {
    // trapézlemez: táblaméret („Méret: 118x200 cm”) és hasznos fedőszélesség az oldalról
    if (!p.sheet) { const s = roofingSheetFromText(text); if (s) p.sheet = s; }
    const u = /Hasznos\s+fedőszélesség:?\s*(\d{3,4})\s*mm/i.exec(text);
    if (u && p.usefulWidth === undefined) p.usefulWidth = Number(u[1]);
  }
  if (p.kind === 'foil' && p.rollM2 === undefined) {
    const m = /(\d+(?:[.,]\d+)?)\s*m[²2]\s*\/\s*tekercs/i.exec(text);
    if (areaPerPiece) p.rollM2 = areaPerPiece; else if (m) p.rollM2 = n(m);
  }
  if (p.kind === 'fastener' && p.boxQty === undefined) {
    const m = /(\d+)\s*db\s*\/\s*(?:dob|cs)/i.exec(p.name) ?? /(\d+)\s*db\s*\/\s*(?:dob|csomag)/i.exec(text);
    if (m) p.boxQty = Number(m[1]);
  }
  return notes;
}

/** Termékszám-védelem: hibaüzenet, ha az új lista gyanúsan kicsi, különben null. */
export function floorProblem(newCount, oldCount) {
  if (newCount < MIN_PRODUCTS) return `csak ${newCount} termék lett (minimum ${MIN_PRODUCTS}).`;
  if (oldCount && newCount < oldCount * MIN_KEEP_RATIO) {
    return `${newCount} termék lett, a meglévő ${oldCount} termék ${MIN_KEEP_RATIO * 100}%-a alatt.`;
  }
  return null;
}

async function main() {
  let urls = await collectUrls();
  const limit = Number(process.env.ARAK_LIMIT);
  const partial = limit > 0;
  if (partial) urls = urls.slice(0, limit);

  const products = [];
  const failures = []; const noPrice = []; const unparsed = []; const defaults = [];
  let i = 0;
  for (const url of urls) {
    i++;
    await sleep(DELAY_MS);
    let html;
    try {
      html = (await getRetry(url)).toString('utf8');
    } catch (e) { failures.push(`${url}: ${e.message}`); continue; }
    const r = extract(html);
    if (r.error) { failures.push(`${url}: ${r.error}`); continue; }
    if (r.noPrice) { noPrice.push(`${r.name} (${url})`); continue; }
    const p = parseProduct({ name: r.name, url, price: r.price, unitText: r.unitText });
    if (!p) { unparsed.push(`${r.name} (${url}) [${r.price} Ft / ${r.unitText}]`); continue; }
    const notes = enrich(p, r.text, r.areaPerPiece);
    if (notes.length) defaults.push(`${p.id}: ${notes.join(', ')} - ${p.name}`);
    products.push(p);
    if (i % 50 === 0) console.error(`... ${i}/${urls.length}`);
  }

  const ratio = urls.length ? failures.length / urls.length : 0;
  if (ratio > MAX_FAIL_RATIO) {
    console.error(`HIBA: ${failures.length}/${urls.length} oldal hibás (${(ratio * 100).toFixed(1)}%), nem írok fájlt.`);
    failures.slice(0, 30).forEach((f) => console.error('  ' + f));
    process.exit(1);
  }

  // Azonos id-k: -<név slug> utótag; ha még mindig egyezik, az olcsóbb marad.
  const byId = new Map();
  for (const p of products) { if (!byId.has(p.id)) byId.set(p.id, []); byId.get(p.id).push(p); }
  const dupes = [];
  for (const group of byId.values()) {
    if (group.length < 2) continue;
    for (const p of group) if (!p.id.endsWith(slug(p.name))) p.id = `${p.id}-${slug(p.name)}`;
  }
  const finalById = new Map();
  for (const p of products) {
    const prev = finalById.get(p.id);
    if (!prev) { finalById.set(p.id, p); continue; }
    const [keep, drop] = prev.price <= p.price ? [prev, p] : [p, prev];
    finalById.set(p.id, keep);
    dupes.push(`${p.id}: megtartva ${keep.price} Ft (${keep.url}), eldobva ${drop.price} Ft (${drop.url})`);
  }
  const list = [...finalById.values()].sort((a, b) =>
    a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const out = {
    source: 'Káplár Fatelep',
    fetchedAt: new Date().toISOString().slice(0, 10),
    shipping: { fee: 14990, freeAbove: 500000 },
    products: list,
  };
  if (!partial) {
    let oldCount = null;
    try { if (existsSync(OUT)) oldCount = JSON.parse(readFileSync(OUT, 'utf8')).products.length; } catch { /* sérült régi fájl: nincs viszonyítás */ }
    const problem = floorProblem(list.length, oldCount);
    if (problem) {
      console.error(`HIBA: ${problem} A meglévő fájlt nem írom felül.`);
      console.error(`  ár nélkül: ${noPrice.length}, nem értelmezhető: ${unparsed.length}, hibás: ${failures.length}`);
      process.exit(1);
    }
  }
  const target = partial ? OUT_PARTIAL : OUT;
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const counts = {};
  for (const p of list) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  console.log(`\nKész: ${list.length} termék -> ${target}`);
  console.log('Kategóriánként:');
  for (const k of Object.keys(counts).sort()) console.log(`  ${k}: ${counts[k]}`);
  console.log(`Hibás oldal: ${failures.length}/${urls.length}`);
  failures.forEach((f) => console.log('  ' + f));
  console.log(`Ár nélküli oldal (kihagyva): ${noPrice.length}`);
  console.log(`Nem értelmezhető név/egység (kihagyva): ${unparsed.length}`);
  unparsed.forEach((f) => console.log('  ' + f));
  console.log(`Pótolt jellemző (alapérték): ${defaults.length}`);
  defaults.forEach((f) => console.log('  ' + f));
  console.log(`Azonos id miatt eldobott: ${dupes.length}`);
  dupes.forEach((f) => console.log('  ' + f));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
