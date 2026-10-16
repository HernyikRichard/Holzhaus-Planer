import type { Mm } from '../model/types';
import type { Bounds } from './camera';
import { formatCm } from '../ui/format';

export type Pt = [Mm, Mm];

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Számok SVG-attribútumba: legfeljebb 1 tizedes, NaN/∞ nélkül. */
export function n(v: number): string {
  return String(Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
}

/** Hosszméret cm-ben (a közös formatCm): "300 cm", "152,5 cm". */
export const cm = formatCm;

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function boundsOf(b: Bounds): { w: Mm; h: Mm; max: Mm } {
  const w = Number.isFinite(b.maxX - b.minX) ? b.maxX - b.minX : 0;
  const h = Number.isFinite(b.maxY - b.minY) ? b.maxY - b.minY : 0;
  return { w, h, max: Math.max(w, h, 1) };
}

/** Pontosabb szám a CSS-be (a kis tartalékértékek miatt 4 tizedes). */
function f4(v: number): string {
  return String(Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0);
}

/**
 * Képernyőn állandó méret: `calc(var(--mmpx, <tartalék>) * <px>px)`. A `--mmpx` (világ-mm / képernyőpixel) a Viewer
 * `<svg>`-jén van; ha nincs megadva, a tartalék × px épp a világméret (`world`).
 */
export function screenPx(world: number, px: number): string {
  return `calc(var(--mmpx, ${f4(world / px)}) * ${f4(px)}px)`;
}

/** A betűméret (fs) képernyőpixelben. */
export const TEXT_PX = 12;

/** Becsült szövegszélesség (a sans-serif átlagos karakterszélességével). */
export function textWidth(s: string, size: Mm): Mm {
  return s.length * size * 0.56;
}

export interface KitOptions { palette: Record<string, string>; screen: boolean }

/**
 * SVG-építő: minden rajzoló hívás egy darab SVG-szöveget ad vissza, és közben bővíti a befoglaló téglalapot.
 * A `fs` (betűméret) és `lw` (nyomtatási vonalvastagság) a rajz kiterjedéséből számolódik (`scaleTo`).
 */
export class Kit {
  readonly b: Bounds = emptyBounds();
  readonly pal: Record<string, string>;
  readonly screen: boolean;
  fs: Mm = 100;
  /** A méretvonalak feliratai: a vonalak után, egyszerre kerülnek ki (`takeLabels`), így egyetlen segédvonal sem fut át rajtuk. */
  private labels: string[] = [];
  lw: Mm = 5;

  constructor(o: KitOptions) {
    this.pal = o.palette;
    this.screen = o.screen;
  }

  /** A betűméret a nézet nagyobb méretének 1/45-e; a nyomtatási vonal 1/1000-e. */
  scaleTo(geom: Bounds): void {
    const { max } = boundsOf(geom);
    this.fs = max / 45;
    this.lw = max / 1000;
  }

  snapshot(): Bounds {
    return { ...this.b };
  }

  ext(x: Mm, y: Mm): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < this.b.minX) this.b.minX = x;
    if (y < this.b.minY) this.b.minY = y;
    if (x > this.b.maxX) this.b.maxX = x;
    if (y > this.b.maxY) this.b.maxY = y;
  }

  c(key: string): string {
    return this.pal[key] ?? this.pal.line ?? 'currentColor';
  }

  /** Körvonal-attribútumok: képernyőn 1 px-es, méretarány-független vonal. */
  stroke(key = 'line', k = 1, dash?: number[]): string {
    const w = this.screen ? k : this.lw * k;
    const ve = this.screen ? ' vector-effect="non-scaling-stroke"' : '';
    const da = dash ? ` stroke-dasharray="${dash.map(d => n(this.screen ? d : d * this.lw)).join(' ')}"` : '';
    return `stroke="${this.c(key)}" stroke-width="${n(w)}"${ve}${da}`;
  }

  fill(key: string, opacity = 1): string {
    return `fill="${this.c(key)}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}`;
  }

  rect(x: Mm, y: Mm, w: Mm, h: Mm, attrs = ''): string {
    const x0 = Math.min(x, x + w);
    const y0 = Math.min(y, y + h);
    const aw = Math.abs(w);
    const ah = Math.abs(h);
    this.ext(x0, y0);
    this.ext(x0 + aw, y0 + ah);
    return `<rect x="${n(x0)}" y="${n(y0)}" width="${n(aw)}" height="${n(ah)}" ${attrs}/>`;
  }

  line(x1: Mm, y1: Mm, x2: Mm, y2: Mm, attrs = ''): string {
    this.ext(x1, y1);
    this.ext(x2, y2);
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`;
  }

  poly(pts: Pt[], attrs = ''): string {
    for (const [x, y] of pts) this.ext(x, y);
    return `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${attrs}/>`;
  }

  polyline(pts: Pt[], attrs = ''): string {
    for (const [x, y] of pts) this.ext(x, y);
    return `<polyline points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" ${attrs}/>`;
  }

  /** Útvonal; a befoglaló téglalaphoz a megadott pontokat veszi figyelembe. */
  path(d: string, pts: Pt[], attrs = ''): string {
    for (const [x, y] of pts) this.ext(x, y);
    return `<path d="${d}" ${attrs}/>`;
  }

  circle(cx: Mm, cy: Mm, r: Mm, attrs = ''): string {
    this.ext(cx - r, cy - r);
    this.ext(cx + r, cy + r);
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attrs}/>`;
  }

  /**
   * Szöveg; a horgony (`anchor`) és a középre igazítás szerint becsült kiterjedéssel.
   * `angle` fokban, a (x, y) pont körül.
   */
  text(x: Mm, y: Mm, s: string, opts: { size?: Mm; anchor?: 'start' | 'middle' | 'end'; angle?: number; color?: string; attrs?: string } = {}): string {
    const size = opts.size ?? this.fs;
    const anchor = opts.anchor ?? 'middle';
    const w = textWidth(s, size);
    const a = ((opts.angle ?? 0) * Math.PI) / 180;
    const x0 = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2;
    for (const [dx, dy] of [[x0, -size / 2], [x0 + w, -size / 2], [x0, size / 2], [x0 + w, size / 2]] as Pt[]) {
      this.ext(x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a));
    }
    // képernyőn: állandó pixelméret (--mmpx), és háttérszínű körvonal (halo), hogy az áthaladó vonalak ne takarják
    const px = (TEXT_PX * size) / this.fs;
    const halo = this.screen
      ? ` stroke="${this.c('bg')}" stroke-linejoin="round" paint-order="stroke"`
        + ` style="font-size:${screenPx(size, px)}; stroke-width:${screenPx(size * 0.2, px * 0.2)}"`
      : '';
    const rot = opts.angle ? ` transform="rotate(${n(opts.angle)} ${n(x)} ${n(y)})"` : '';
    return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" fill="${this.c(opts.color ?? 'text')}" `
      + `text-anchor="${anchor}" dominant-baseline="central"${halo}${rot}${opts.attrs ? ` ${opts.attrs}` : ''}>${esc(s)}</text>`;
  }

  /**
   * Méretvonal az (x1,y1)–(x2,y2) szakaszhoz, a szakaszra merőlegesen `offset`-tel eltolva.
   * Az eltolás iránya a (−dy, dx)/hossz normális: balról jobbra húzott vízszintes szakasznál a pozitív offset LEFELÉ visz,
   * felülről lefelé húzott függőlegesnél balra, alulról felfelé húzottnál jobbra.
   * A felirat a vonal külső oldalára kerül; ha nem fér el a szakaszon, az `overflow` szerint a vonal elé/mögé vagy a másik oldalra.
   * A felirat NEM része a visszaadott szövegnek: a `takeLabels()` adja ki (a méretvonalak után).
   */
  dim(x1: Mm, y1: Mm, x2: Mm, y2: Mm, offset: Mm, label: string, overflow: 'start' | 'end' | 'inside' = 'end'): string {
    const fs = this.fs;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ux = dx / len;
    const uy = dy / len;
    const ax = x1 + nx * offset;
    const ay = y1 + ny * offset;
    const bx = x2 + nx * offset;
    const by = y2 + ny * offset;
    const side = offset >= 0 ? 1 : -1;
    const ext = fs * 0.4;
    const tick = fs * 0.35;
    const st = this.stroke('dim');
    const thin = this.stroke('dim', 0.6);
    let out = `<g class="dim">`;
    out += this.line(x1 + nx * side * fs * 0.2, y1 + ny * side * fs * 0.2, ax + nx * side * ext, ay + ny * side * ext, `${thin} stroke-opacity="0.6"`);
    out += this.line(x2 + nx * side * fs * 0.2, y2 + ny * side * fs * 0.2, bx + nx * side * ext, by + ny * side * ext, `${thin} stroke-opacity="0.6"`);
    out += this.line(ax, ay, bx, by, st);
    // 45°-os ferde jelek a végeken
    const tx = (ux + nx) * tick / 2;
    const ty = (uy + ny) * tick / 2;
    out += this.line(ax - tx, ay - ty, ax + tx, ay + ty, st);
    out += this.line(bx - tx, by - ty, bx + tx, by + ty, st);
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    // a felirat balról jobbra vagy alulról felfelé olvasható
    if (angle >= 90) angle -= 180;
    else if (angle < -90) angle += 180;
    const tw = textWidth(label, fs);
    let mx = (ax + bx) / 2 + nx * side * fs * 0.75;
    let my = (ay + by) / 2 + ny * side * fs * 0.75;
    if (tw > len - fs * 0.3) {
      // nem fér el: a vonal elején/végén túlra, vagy (lánc belsejében) a vonal másik oldalára
      if (overflow === 'end') {
        mx = bx + ux * (tw / 2 + fs * 0.4) + nx * side * fs * 0.75;
        my = by + uy * (tw / 2 + fs * 0.4) + ny * side * fs * 0.75;
      } else if (overflow === 'start') {
        mx = ax - ux * (tw / 2 + fs * 0.4) + nx * side * fs * 0.75;
        my = ay - uy * (tw / 2 + fs * 0.4) + ny * side * fs * 0.75;
      } else {
        mx = (ax + bx) / 2 - nx * side * fs * 0.75;
        my = (ay + by) / 2 - ny * side * fs * 0.75;
      }
    }
    if (!this.screen) {
      this.labels.push(this.text(mx, my, label, { angle, color: 'dim' }));
      return `${out}</g>`;
    }
    // képernyőn: a felirat egy horgonyponthoz kötött, --mmpx-szel skálázott csoportban, pixelegységben;
    // háttérszínű címkealappal, hogy a más méretvonalak segédvonalai ne húzódjanak át rajta
    this.text(mx, my, label, { angle, color: 'dim' }); // csak a befoglaló téglalaphoz
    const P = TEXT_PX;
    const twp = textWidth(label, P);
    const ar = (angle * Math.PI) / 180;
    const ex: Pt = [Math.cos(ar), Math.sin(ar)];
    const ey: Pt = [-Math.sin(ar), Math.cos(ar)];
    const wN = (nx * side) * ey[0] + (ny * side) * ey[1]; // a kifelé normális a helyi y irányban (±1)
    const uX = ux * ex[0] + uy * ex[1]; // a vonal iránya a helyi x irányban (±1)
    let ox = (ax + bx) / 2;
    let oy = (ay + by) / 2;
    let lx = 0;
    let ly = wN * P * 0.75;
    if (tw > len - fs * 0.3) {
      if (overflow === 'end') { ox = bx; oy = by; lx = uX * (twp / 2 + P * 0.4); }
      else if (overflow === 'start') { ox = ax; oy = ay; lx = -uX * (twp / 2 + P * 0.4); }
      else ly = -ly;
    }
    const pw = twp + P * 0.3;
    const ph = P * 1.1;
    this.labels.push(`<g transform="translate(${n(ox)} ${n(oy)}) rotate(${n(angle)})">`
      + `<g style="transform:scale(var(--mmpx, ${f4(fs / P)}))">`
      + `<rect x="${n(lx - pw / 2)}" y="${n(ly - ph / 2)}" width="${n(pw)}" height="${n(ph)}" ${this.fill('bg', 0.85)}/>`
      + `<text x="${n(lx)}" y="${n(ly)}" font-size="${P}" fill="${this.c('dim')}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`
      + `</g></g>`);
    return `${out}</g>`;
  }

  /** Az eddig gyűjtött méretfeliratok (és a gyűjtő ürítése); a méretvonalak után kell kiírni. */
  takeLabels(): string {
    const s = this.labels.join('');
    this.labels = [];
    return s ? `<g class="dim-labels">${s}</g>` : '';
  }

  /** Méretlánc a pontsoron (egy egyenes mentén, növekvő sorrendben), közös offsettel. */
  chain(pts: Pt[], offset: Mm): string {
    let out = '';
    const last = pts.length - 2;
    for (let i = 0; i <= last; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      out += this.dim(a[0], a[1], b[0], b[1], offset, cm(len), i === last ? 'end' : i === 0 ? 'start' : 'inside');
    }
    return out;
  }
}

/** Egy elem csoportja: `<g data-el="…" class="el el-<kind>">`. */
export function elGroup(id: string, kind: string, body: string, extra = '', extraClass = ''): string {
  return `<g data-el="${esc(id)}" class="el el-${kind}${extraClass ? ` ${extraClass}` : ''}"${extra ? ` ${extra}` : ''}>${body}</g>`;
}

/** Rögzítésfajtánként: sugárszorzó (a nézet alapsugarához), képernyőn a sugár pixelben, kitöltés, átlátszóság. */
const FX_STYLE: Record<string, { k: number; px: number; fill: string; opacity: number; ring?: boolean }> = {
  anchor: { k: 1.6, px: 5, fill: 'fastener', opacity: 0.95, ring: true },
  frameScrew: { k: 1, px: 3, fill: 'fastener', opacity: 0.9 },
  hurricaneTie: { k: 1.2, px: 3.5, fill: 'fastener', opacity: 0.9 },
  osbScrew: { k: 0.55, px: 1.8, fill: 'fastenerMuted', opacity: 0.6 },
};

/**
 * Rögzítési pont: `<circle data-fx="…" class="fx fx-<kind>">`, fajtánként eltérő mérettel és színnel.
 * Képernyőn a sugár állandó pixelméret (--mmpx); a kis pontoknak átlátszó, vastag körvonal adja a rámutatási felületet.
 */
export function fxCircle(kit: Kit, id: string, kind: string, x: Mm, y: Mm, r: Mm): string {
  const st = FX_STYLE[kind] ?? FX_STYLE.frameScrew;
  const R = r * st.k;
  let attrs = `data-fx="${esc(id)}" class="fx fx-${kind}" ${kit.fill(st.fill, st.opacity)}`;
  if (st.ring) attrs += ` ${kit.stroke('bg', 1.5)}`;
  else if (kit.screen && kind !== 'osbScrew') attrs += ' stroke="transparent" stroke-width="4" vector-effect="non-scaling-stroke"';
  if (kit.screen) attrs += ` style="r:${screenPx(R, st.px)}"`;
  return kit.circle(x, y, R, attrs);
}

/** Csak a megadott pontokra szűkített befoglaló (a feliratok nélküli geometria). */
export function boundsOfPts(pts: Pt[]): Bounds {
  const b = emptyBounds();
  for (const [x, y] of pts) {
    b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

/** Teljes SVG-dokumentum (PDF-hez): viewBox = bounds + margó. */
export function svgDocument(b: Bounds, margin: Mm, body: string, title: string, bg: string): string {
  const x = b.minX - margin;
  const y = b.minY - margin;
  const w = b.maxX - b.minX + 2 * margin;
  const h = b.maxY - b.minY + 2 * margin;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}" width="100%" `
    + `role="img" aria-label="${esc(title)}" font-family="DejaVu Sans, sans-serif"><title>${esc(title)}</title>`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${bg}"/>${body}</svg>`;
}
