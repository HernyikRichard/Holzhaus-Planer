import { BUNDLED_PRICE_LIST } from '../../src/prices';

describe('BUNDLED_PRICE_LIST', () => {
  it('nem null', () => {
    expect(BUNDLED_PRICE_LIST).not.toBeNull();
    expect(BUNDLED_PRICE_LIST!.source).toBe('Káplár Fatelep');
  });
  it('van 50x100-as faanyag', () => {
    const t = BUNDLED_PRICE_LIST!.products.filter(
      (p) => p.kind === 'timber' && p.section?.t === 50 && p.section?.w === 100);
    expect(t.length).toBeGreaterThanOrEqual(1);
  });
  it('minden ár > 0, minden URL a Káplár oldalra mutat, az id-k egyediek', () => {
    const ps = BUNDLED_PRICE_LIST!.products;
    for (const p of ps) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.url.startsWith('https://kaplarfatelep.hu/')).toBe(true);
    }
    expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
  });
});
