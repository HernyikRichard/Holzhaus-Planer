import { extract, enrich, floorProblem } from '../../scripts/arak';
import { parseProduct } from '../../scripts/parse';

const page = (name: string, body: string) =>
  `<html><body><h1>${name}</h1><div class="price"><span>${body}</span></div></body></html>`;

describe('extract + enrich (fixture HTML)', () => {
  it('OSB: darabár a db egységű sorból, lap 1250x2500 a 3.125 m²/tábla alapján', () => {
    const r = extract(page('Osb-3 lap 12mm',
      '<b>7 090 Ft / db</b> <span>Bruttó: 2 269 Ft / m² 3.125</span> 1 tábla = 3,125 m²'));
    expect(r.price).toBe(7090);
    expect(r.unitText).toBe('db');
    expect(r.areaPerPiece).toBe(3.125);
    const p = parseProduct({ name: r.name!, url: 'https://kaplarfatelep.hu/x', price: r.price!, unitText: r.unitText! })!;
    expect(enrich(p, r.text!, r.areaPerPiece)).toEqual([]);
    expect(p.unit).toBe('tábla');
    expect(p.sheet).toEqual({ w: 1250, l: 2500 });
    expect(p.id).toBe('osb-12-1250x2500');
  });

  it('trapézlemez T18: packM2 a Bruttó sor szorzójából', () => {
    const r = extract(page('Trapézlemez T18 PLUSZ RAL 3009 bordó',
      '<b>12 490 Ft / db</b> <span>Bruttó: 5 292 Ft / m² 2.36</span>'));
    expect(r.price).toBe(12490);
    const p = parseProduct({ name: r.name!, url: 'https://kaplarfatelep.hu/x', price: r.price!, unitText: r.unitText! })!;
    enrich(p, r.text!, r.areaPerPiece);
    expect(p.kind).toBe('roofing');
    expect(p.packM2).toBe(2.36);
  });

  it('léc: a Bruttó db ár a darabár, nem a méterár', () => {
    const r = extract(page('Bramac PLUS tetőléc 3x5x400cm', '<b>349 Ft / méter</b> Bruttó: 1 396 Ft / db 0.25'));
    expect(r.price).toBe(1396);
    expect(r.unitText).toBe('db');
  });

  it('ár nélküli oldal: noPrice, nem hiba', () => {
    const r = extract(page('IKO Superglass zsindely', 'Kérjen árajánlatot'));
    expect(r.noPrice).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('h1 nélküli oldal: hiba', () => {
    expect(extract('<html><body>Nem található</body></html>').error).toBeDefined();
  });
});

describe('floorProblem', () => {
  it('150 alatt hiba, még ha nincs régi fájl is', () => {
    expect(floorProblem(149, null)).toMatch(/149/);
  });
  it('a régi darabszám 70%-a alatt hiba', () => {
    expect(floorProblem(200, 300)).not.toBeNull();
    expect(floorProblem(210, 300)).toBeNull();
  });
  it('rendben, ha elég nagy', () => {
    expect(floorProblem(317, 317)).toBeNull();
    expect(floorProblem(150, null)).toBeNull();
  });
});
