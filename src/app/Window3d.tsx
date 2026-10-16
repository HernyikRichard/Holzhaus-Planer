import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import type { UiStore, View3dState } from './uiStore';
import { useStore, useUi } from './hooks';
import { sceneFor, viewForElement } from './selection';
import type { Plan } from '../model/types';
// a modell-építő nem húzza be a Three.js-t; a kirajzoló csak dinamikusan töltődik (külön chunk)
import { buildModel3d, FRAME_ONLY, LAYER3D_GROUPS, LAYER3D_NAMES, type Layer3dId, type Model3d } from '../three-d/model';
import type { Renderer3d } from '../three-d/renderer';
import type { ViewPreset } from '../three-d/threeScene';

const MIN_W = 240;
const MIN_H = 180;
/** Alaphelyzetben (x/y = −1) ekkora margó a vászon jobb alsó sarkától. */
const MARGIN = 16;
/** Hézag a 2D nagyítógombok fölött. */
const RESERVE_GAP = 8;
/** Ennél kisebb elmozdulás kattintás, nem forgatás. */
const CLICK_PX = 4;
/** A terv változása után ennyi ms múlva épül újra a 3D modell. */
const REBUILD_MS = 100;
/** A fejléc és a gyorsnézet-sáv magassága (app.css), a vászonméret becsléséhez, ha nincs elrendezés. */
const HEAD_H = 30;
const BAR_H = 32;
const ALL_LAYERS: Layer3dId[] = LAYER3D_GROUPS.flatMap(g => g.layers);

const PRESETS: { id: ViewPreset | 'reset'; label: string; title: string }[] = [
  { id: 'persp', label: 'Persp.', title: 'Perspektíva' },
  { id: 'N', label: 'É', title: 'Északi oldal' },
  { id: 'E', label: 'K', title: 'Keleti oldal' },
  { id: 'S', label: 'D', title: 'Déli oldal' },
  { id: 'W', label: 'Ny', title: 'Nyugati oldal' },
  { id: 'top', label: 'Felül', title: 'Felülnézet' },
  { id: 'reset', label: '⟲', title: 'Alaphelyzet' },
];

/** A kirajzoló betöltése; objektumban, hogy a tesztek a betöltési hibát is ki tudják próbálni. */
export const rendererLoader = { load: () => import('../three-d/renderer') };

interface Rect { x: number; y: number; w: number; h: number }
interface Size { w: number; h: number }
/** import: a chunk nem töltődött be; webgl: nincs WebGL; start: egyéb indítási hiba. */
type Status = 'loading' | 'ready' | 'import' | 'webgl' | 'start';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Az ablak helye a vásznon: nagyítva a teljes vászon, egyébként a vásznon belül tartva, legalább 240×180.
 * Alaphelyzetben (y < 0) a jobb alsó sarokban, de a 2D nagyítógombok (`reserveBottom` px sáv) fölött;
 * ha nem fér el, előbb a magasság csökken (legfeljebb 180-ig).
 */
export function windowRect(v: View3dState, b: Size, reserveBottom = 0): Rect {
  if (v.maximized) return { x: 0, y: 0, w: b.w, h: b.h };
  const w = clamp(v.w, Math.min(MIN_W, b.w), b.w);
  const bottom = v.y < 0 ? Math.max(MARGIN, reserveBottom > 0 ? reserveBottom + RESERVE_GAP : 0) : 0;
  const minH = Math.min(MIN_H, b.h);
  const h = clamp(v.h, minH, Math.max(minH, b.h - bottom));
  const x = v.x < 0 ? b.w - w - MARGIN : v.x;
  const y = v.y < 0 ? b.h - h - bottom : v.y;
  return { x: clamp(x, 0, b.w - w), y: clamp(y, 0, b.h - h), w, h };
}

/** Teljes láthatósági térkép a modell rétegeire (hiányzó kulcs = látható). */
function visibility(model: Model3d, layers: View3dState['layers']): Partial<Record<Layer3dId, boolean>> {
  const out: Partial<Record<Layer3dId, boolean>> = {};
  for (const l of model.layers) out[l] = layers[l] !== false;
  return out;
}

/** A 3D modell; hibánál naplóz és null (a hívó az előző modellt tartja meg). */
function tryBuild(plan: Plan): Model3d | null {
  try {
    return buildModel3d(plan, sceneFor(plan));
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** Lebegő 3D ablak a rajzvászon fölött; csak nyitott állapotban van a DOM-ban. */
interface Window3dProps {
  store: Store; ui: UiStore; bounds: Size;
  /** A vászon aljából a 2D nagyítógombok sávja (px); az alaphelyzetű ablak ezt szabadon hagyja. */
  reserveBottom?: number;
}

export function Window3d(props: Window3dProps) {
  const open = useUi(props.ui, s => s.view3d.open);
  return open ? <Window3dOpen {...props} /> : null;
}

function Window3dOpen({ store, ui, bounds, reserveBottom = 0 }: Window3dProps) {
  const v = useUi(ui, s => s.view3d);
  const selected = useUi(ui, s => s.selected);
  const plan = useStore(store, s => s.lastValidPlan);
  const [model, setModel] = useState<Model3d | null>(() => tryBuild(plan));
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [live, setLive] = useState<Rect | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);

  const canvas = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer3d | null>(null);
  const builtFor = useRef(plan);
  const modelRef = useRef(model);
  modelRef.current = model;
  const rect = live ?? windowRect(v, bounds, reserveBottom);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const gesture = useRef<{ kind: 'move' | 'resize'; sx: number; sy: number; start: Rect; cur: Rect } | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const hoverAt = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);

  /** A rajzfelület valódi mérete; elrendezés nélkül (jsdom) az ablakméretből becsülve. */
  const measure = (): Size => {
    const r = body.current?.getBoundingClientRect();
    const w = r && r.width > 0 ? r.width : rectRef.current.w;
    const h = r && r.height > 0 ? r.height : rectRef.current.h - HEAD_H - BAR_H;
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Kirajzoló: minden próbálkozás saját (friss) vásznon, mert a dispose() elengedi a WebGL-kontextust.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    rendererLoader.load().then(mod => {
      if (cancelled || !canvas.current) return;
      let r: Renderer3d;
      try {
        r = mod.createRenderer(canvas.current);
      } catch (err) {
        if (err instanceof Error && err.message === 'webgl') { setStatus('webgl'); return; }
        console.error(err);
        setStatus('start');
        return;
      }
      renderer.current = r; // a takarítás (bezárás / Újra) hiba esetén is elengedi
      try {
        const size = measureRef.current();
        r.resize(size.w, size.h); // a valódi méret az első (perspektív) igazítás előtt
        const sel = ui.get().selected;
        r.setHighlight(sel ? [sel] : []);
        const m = modelRef.current;
        if (m) {
          r.setVisible(visibility(m, ui.get().view3d.layers));
          r.setModel(m);
        }
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setStatus('start');
      }
    }, () => { if (!cancelled) setStatus('import'); });
    return () => {
      cancelled = true;
      if (hoverFrame.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = 0;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [attempt]);

  // Modell-újraépítés a terv változására, 100 ms-os késleltetéssel; hibás építésnél a régi modell marad.
  useEffect(() => {
    if (plan === builtFor.current) return;
    const t = setTimeout(() => {
      builtFor.current = plan;
      const m = tryBuild(plan);
      if (m) setModel(m);
    }, REBUILD_MS);
    return () => clearTimeout(t);
  }, [plan]);

  useEffect(() => {
    const r = renderer.current;
    if (!r || !model) return;
    r.setVisible(visibility(model, ui.get().view3d.layers));
    r.setModel(model);
  }, [model]);

  useEffect(() => {
    const m = modelRef.current;
    if (m) renderer.current?.setVisible(visibility(m, v.layers));
  }, [v.layers]);

  useEffect(() => { renderer.current?.setHighlight(selected ? [selected] : []); }, [selected]);

  // Méretváltás: ablak-átméretezés, nagyítás / vissza, vászonméret.
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const s = measure();
    r.resize(s.w, s.h);
  }, [rect.w, rect.h, status]);
  useEffect(() => {
    const el = body.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const s = measureRef.current();
      renderer.current?.resize(s.w, s.h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setView3d = (patch: Partial<View3dState>) => ui.set({ view3d: { ...ui.get().view3d, ...patch } });
  const setLayers = (layers: View3dState['layers']) => setView3d({ layers });
  const only = (ids: Layer3dId[]) => {
    const out: Partial<Record<Layer3dId, boolean>> = {};
    for (const l of ALL_LAYERS) out[l] = ids.includes(l);
    setLayers(out);
  };

  // Fejléc-húzás és sarok-átméretezés
  const startGesture = (kind: 'move' | 'resize') => (e: PointerEvent) => {
    if (e.button !== 0 || v.maximized) return;
    if (kind === 'move' && (e.target as Element | null)?.closest?.('button')) return;
    e.preventDefault();
    gesture.current = { kind, sx: e.clientX, sy: e.clientY, start: rect, cur: rect };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const moveGesture = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    const s = g.start;
    const next = g.kind === 'move'
      ? { ...s, x: clamp(s.x + dx, 0, bounds.w - s.w), y: clamp(s.y + dy, 0, bounds.h - s.h) }
      : { ...s, w: clamp(s.w + dx, Math.min(MIN_W, bounds.w - s.x), bounds.w - s.x), h: clamp(s.h + dy, Math.min(MIN_H, bounds.h - s.y), bounds.h - s.y) };
    g.cur = next;
    setLive(next);
  };
  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    setLive(null);
    const { x, y, w, h } = g.cur;
    if (x !== g.start.x || y !== g.start.y || w !== g.start.w || h !== g.start.h) setView3d({ x, y, w, h });
  };

  // Kattintás (≤ 4 px) kijelöl, húzás forgat; ráállás: kiemelés + buborék
  const onCanvasDown = (e: PointerEvent) => { press.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
  const onCanvasUp = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    const r = renderer.current;
    if (!p || !r || Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_PX) return;
    const id = r.pick(e.clientX, e.clientY)?.elementId;
    if (!id) return;
    const pl = store.get().lastValidPlan;
    const el = sceneFor(pl).elements.find(x => x.id === id);
    if (el) ui.set({ selected: el.id, detailOpen: true, view: viewForElement(el, pl) });
  };
  const doHover = () => {
    hoverFrame.current = 0;
    const r = renderer.current;
    const at = hoverAt.current;
    if (!r || !at) return;
    const hit = r.pick(at.x, at.y);
    r.setHover(hit?.elementId ?? null);
    const br = body.current?.getBoundingClientRect();
    const x = at.x - (br?.left ?? 0);
    const y = at.y - (br?.top ?? 0);
    setTip(hit ? { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, label: hit.label } : null);
  };
  const clearHover = () => {
    hoverAt.current = null;
    if (hoverFrame.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = 0;
    renderer.current?.setHover(null);
    setTip(null);
  };
  const onCanvasMove = (e: PointerEvent) => {
    if (e.buttons !== 0) { if (hoverAt.current) clearHover(); return; } // forgatás / mozgatás közben nincs ráállás
    hoverAt.current = { x: e.clientX, y: e.clientY };
    if (hoverFrame.current) return;
    if (typeof requestAnimationFrame === 'function') hoverFrame.current = requestAnimationFrame(doHover);
    else doHover();
  };

  const ready = status === 'ready';
  const message = status === 'import' ? 'A 3D nézet nem tölthető be.'
    : status === 'webgl' ? 'A 3D nézethez WebGL-képes böngésző szükséges.'
    : status === 'start' ? 'A 3D nézet nem indítható el.'
    : !model ? 'A 3D modell nem építhető fel ebből a tervből.'
    : status === 'loading' ? '3D betöltése…' : null;
  const canRetry = status === 'import' || status === 'start';

  return (
    <section class={`window3d${v.maximized ? ' maximized' : ''}`} aria-label="3D nézet"
      style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }}
      onKeyDown={e => e.stopPropagation()}>
      <div class="w3d-head" onPointerDown={startGesture('move')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
        <span class="w3d-title">3D nézet</span>
        <button type="button" data-action="3d-max" aria-label={v.maximized ? 'Eredeti méret' : 'Teljes vászon'}
          title={v.maximized ? 'Eredeti méret' : 'Teljes vászon'} onClick={() => setView3d({ maximized: !v.maximized })}>⤢</button>
        <button type="button" data-action="3d-close" aria-label="3D nézet bezárása" title="Bezárás"
          onClick={() => setView3d({ open: false })}>✕</button>
      </div>
      <div class="w3d-bar" role="toolbar" aria-label="3D nézőpontok">
        <button type="button" data-action="3d-layers" aria-expanded={panelOpen} class={panelOpen ? 'active' : ''}
          onClick={() => setPanelOpen(!panelOpen)}>Rétegek</button>
        {PRESETS.map(p => (
          <button type="button" key={p.id} data-preset={p.id} title={p.title} disabled={!ready}
            onClick={() => renderer.current?.setView(p.id === 'reset' ? 'persp' : p.id)}>{p.label}</button>
        ))}
      </div>
      <div class="w3d-body" ref={body}>
        <canvas key={attempt} ref={canvas} tabIndex={0} aria-label="3D modell"
          onPointerDown={onCanvasDown} onPointerUp={onCanvasUp} onPointerMove={onCanvasMove} onPointerLeave={clearHover}
          onContextMenu={e => e.preventDefault()} />
        {panelOpen && model && (
          <div class="w3d-layers" role="group" aria-label="3D rétegek">
            <div class="w3d-quick">
              <button type="button" data-action="3d-frame-only" onClick={() => only(FRAME_ONLY)}>Csak váz</button>
              <button type="button" data-action="3d-all" onClick={() => only(ALL_LAYERS)}>Minden</button>
            </div>
            {LAYER3D_GROUPS.map(g => {
              const present = g.layers.filter(l => model.layers.includes(l));
              if (present.length === 0) return null;
              return (
                <fieldset key={g.name}>
                  <legend>{g.name}</legend>
                  {present.map(l => (
                    <label key={l}>
                      <input type="checkbox" data-layer3d={l} checked={v.layers[l] !== false}
                        onChange={() => setLayers({ ...v.layers, [l]: v.layers[l] === false })} /> {LAYER3D_NAMES[l]}
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>
        )}
        {tip && <div class="w3d-tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>{tip.label}</div>}
        {message !== null && (
          <div class="w3d-msg" role={status === 'loading' && model ? 'status' : 'alert'}>
            <span>{message}</span>
            {canRetry && <button type="button" data-action="3d-retry" onClick={() => setAttempt(attempt + 1)}>Újra</button>}
          </div>
        )}
      </div>
      {!v.maximized && <div class="w3d-resize" aria-hidden="true"
        onPointerDown={startGesture('resize')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} />}
    </section>
  );
}
