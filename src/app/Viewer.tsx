import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { STEPS } from './steps';
import { fitCamera, panBy, reaspect, zoomAt, type Camera } from '../viewer/camera';
import { LAYER_NAMES, VIEW_LAYERS, VIEW_NAMES } from '../viewer/layers';
import { paletteStyle, SCREEN_PALETTE } from '../viewer/theme';
import { renderView } from '../viewer/render';
import { highlightSvg, tempDimsSvg } from '../viewer/overlay';
import { toWorld } from '../viewer/views/world';
import { floorWallMap } from '../viewer/views/floorPlan';
import { addOpening, moveOpening } from '../ui/openingLogic';
import { dragOffset, dragSill, liveDims, openingIdOfElement, selectOpening } from './openingDrag';
import { boundsOf } from '../viewer/svgKit';
import { groupLength, tempDimensions } from '../scene/neighbours';
import { Tooltip } from './Tooltip';
import { drawSource, kindShown, orderedIds, stepNeighbour, targetLines } from './selection';

const DEFAULT_SIZE = { w: 800, h: 600 };
const DRAG_THRESHOLD_PX = 20;
/** Üres kattintás / Escape: nincs kijelölés és kiemelés, az adatlap bezárul. */
const EMPTY_CLICK = { selected: null, selectedOpening: null, highlight: [], detailOpen: false };

interface OpeningDrag {
  openingId: string; elId: string; x: number; y: number; moved: boolean; mmpx: number;
  group: string; type: 'door' | 'window'; startOffset: number; startSill: number; v0: number;
  /** a fal u és v tengelyének egységvektora a nézet világkoordinátájában */
  au: [number, number]; av: [number, number];
  offset: number; sill: number;
}
interface Chooser { x: number; y: number; side: 'N' | 'E' | 'S' | 'W'; pos: number }

function shiftOf(plan: Parameters<typeof toWorld>[0], view: Parameters<typeof toWorld>[1], group: string, u0: number, v0: number, u1: number, v1: number): [number, number] {
  const a = toWorld(plan, view, group, u0, v0);
  const b = toWorld(plan, view, group, u1, v1);
  return a && b ? [b[0] - a[0], b[1] - a[1]] : [0, 0];
}

export function Viewer({ store, ui }: { store: Store; ui: UiStore }) {
  const step = useUi(ui, s => s.step);
  const view = useUi(ui, s => s.view);
  const layers = useUi(ui, s => s.layers);
  const hovered = useUi(ui, s => s.hovered);
  const selected = useUi(ui, s => s.selected);
  const highlight = useUi(ui, s => s.highlight);
  const stored = useUi(ui, s => s.cameras[s.view]);
  const state = useStore(store, s => s);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [panning, setPanning] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  const tipMove = useRef<((p: { x: number; y: number }) => void) | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const space = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const od = useRef<OpeningDrag | null>(null);
  const [live, setLive] = useState<{ offset: number; sill: number; openingId: string } | null>(null);
  const [chooser, setChooser] = useState<Chooser | null>(null);

  const stepDef = STEPS.find(s => s.id === step)!;
  const src = drawSource(state, view);
  const invalidKey = src.invalid ? [...src.invalid].sort().join('|') : '';
  const drawn = useMemo(
    () => renderView({ plan: src.plan, scene: src.scene, view, layers, palette: SCREEN_PALETTE, invalidOpeningIds: src.invalid }),
    [src.plan, src.scene, view, layers, invalidKey],
  );
  const overlay = useMemo(() => {
    const { plan, scene } = src;
    const fs = boundsOf(drawn.bounds).max / 45;
    let out = '';
    const dragged = live ? plan.openings.find(o => o.id === live.openingId) : undefined;
    if (live && dragged) {
      const t = plan.walls.studSection.t;
      const [dx, dy] = shiftOf(plan, view, `wall.${dragged.wall}`, dragged.offset, t + dragged.sillHeight, live.offset, t + live.sill);
      const own = scene.elements.find(e => e.kind === 'opening' && e.openingId === live.openingId)?.id;
      if (own) out += `<g transform="translate(${dx} ${dy})">${highlightSvg(scene, own, view, plan)}</g>`;
      try { out += tempDimsSvg(liveDims(plan, live.openingId, live.offset, live.sill), view, plan, `wall.${dragged.wall}`, fs, view === 'floor' ? { u: 0, v: 0 } : { u: dragged.width / 2, v: dragged.height / 2 }); } catch { /* nincs méretvonal */ }
      return out;
    }
    for (const id of new Set([...(selected ? [selected] : []), ...highlight, ...(hovered ? [hovered] : [])])) out += highlightSvg(scene, id, view, plan);
    const el = hovered ? scene.elements.find(e => e.id === hovered) : undefined;
    if (el) {
      try { out += tempDimsSvg(tempDimensions(scene, groupLength(plan, el.group), el.id), view, plan, el.group, fs, { u: el.geom.w / 2, v: el.geom.h / 2 }); } catch { /* nincs méretvonal */ }
    }
    return out;
  }, [src.plan, src.scene, view, hovered, selected, highlight, drawn.bounds, live]);
  const tipLines = useMemo(() => {
    if (!hovered) return [];
    try { return targetLines(src.scene, src.plan, state.errors, hovered); } catch { return []; }
  }, [hovered, src.plan, src.scene, state.errors]);
  const fit = fitCamera(drawn.bounds, size.w, size.h);
  const cam: Camera = reaspect(stored ?? fit, size.w, size.h);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const viewRef = useRef(view);
  viewRef.current = view;

  const latest = (): Camera => reaspect(ui.get().cameras[viewRef.current] ?? fitRef.current, sizeRef.current.w, sizeRef.current.h);
  const setCam = (c: Camera) => ui.set({ cameras: { ...ui.get().cameras, [viewRef.current]: c } });
  const zoomCenter = (factor: number) => {
    const { w, h } = sizeRef.current;
    setCam(zoomAt(latest(), factor, w / 2, h / 2, w, h, fitRef.current));
  };
  const resetCam = () => {
    const { [viewRef.current]: _drop, ...rest } = ui.get().cameras;
    ui.set({ cameras: rest });
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { w, h } = sizeRef.current;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * h : e.deltaY;
      setCam(zoomAt(latest(), Math.pow(1.15, -dy / 100), e.clientX - r.left, e.clientY - r.top, w, h, fitRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => { if (ui.get().hovered !== null) ui.set({ hovered: null }); setChooser(null); }, [view, step]);

  useEffect(() => {
    if (!chooser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setChooser(null); };
    const onDown = (e: Event) => { if (!(e.target as Element | null)?.closest?.('.opening-chooser')) setChooser(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true); };
  }, [chooser]);

  useEffect(() => {
    const up = (e: KeyboardEvent) => { if (e.key === ' ') space.current = false; };
    const blur = () => { space.current = false; finishOpening(false); };
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') { space.current = true; e.preventDefault(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (e.key === '+' || e.key === '=') zoomCenter(1.15);
    else if (e.key === '-') zoomCenter(1 / 1.15);
    else if (e.key === '0') resetCam();
    else if (e.key === 'Escape') ui.set(EMPTY_CLICK);
    else if (e.key === 'Enter') { if (ui.get().selected) { e.preventDefault(); ui.set({ detailOpen: true }); } }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const cur = ui.get().selected;
      const next = cur ? stepNeighbour(src.scene, cur, e.key === 'ArrowLeft' ? 'left' : 'right') : null;
      e.preventDefault();
      if (next) ui.set({ selected: next });
    } else if (e.key === 'Tab') {
      const ids = orderedIds(src.scene, view, src.plan).filter(id => kindShown(src.scene.elements.find(x => x.id === id)!.kind, view, layers));
      const cur = ui.get().selected;
      const i = cur ? ids.indexOf(cur) : -1;
      const back = e.shiftKey;
      let next: string | undefined;
      if (i >= 0) next = ids[i + (back ? -1 : 1)];
      else if (cur === null || !back) next = back ? undefined : ids[0];
      else next = ids[ids.length - 1];
      // az első elemről visszafelé / az utolsó után előre az alapértelmezett fókuszlépés marad (nincs fókuszcsapda)
      if (next !== undefined) { e.preventDefault(); ui.set({ selected: next }); }
    }
  };
  const onClick = (e: MouseEvent) => {
    if (moved.current || space.current) { moved.current = false; return; }
    const target = e.target as Element | null;
    // Nyílászárók lépés, alaprajz: falra kattintva (nyíláson kívül) a választó ajtót / ablakot kínál
    const wallEl = step === 'openings' && view === 'floor' && !target?.closest?.('[data-opening-id]') ? target?.closest?.('[data-wall]') : null;
    if (wallEl) {
      const side = wallEl.getAttribute('data-wall') as Chooser['side'];
      const r = svg.current?.getBoundingClientRect();
      const wr = wrap.current?.getBoundingClientRect();
      const m = floorWallMap(src.plan, side);
      const k = cam.w / Math.max(size.w, 1);
      const wx = cam.x + (e.clientX - (r?.left ?? 0)) * k;
      const wy = cam.y + (e.clientY - (r?.top ?? 0)) * k;
      setChooser({ x: e.clientX - (wr?.left ?? 0), y: e.clientY - (wr?.top ?? 0), side, pos: m.horizontal ? wx - m.x0 : wy - m.y0 });
      return;
    }
    const hit = target?.closest?.('[data-el],[data-fx]') ?? null;
    const id = hit ? (hit.getAttribute('data-fx') ?? hit.getAttribute('data-el')) : null;
    ui.set(id ? { selected: id, detailOpen: true, highlight: [] } : EMPTY_CLICK);
  };
  const editing = (step === 'openings' || step === 'walls') && (view === 'floor' || view.startsWith('wall.'));
  const onPointerDown = (e: PointerEvent) => {
    if (od.current) finishOpening(false); // elmaradt felengedés után maradt húzás
    moved.current = false;
    const opEl = editing && e.button === 0 && !space.current ? (e.target as Element | null)?.closest?.('[data-opening-id]') : null;
    const openingId = opEl?.getAttribute('data-opening-id');
    const o = openingId ? src.plan.openings.find(x => x.id === openingId) : undefined;
    if (o && opEl) {
      const group = `wall.${o.wall}`;
      const p0 = toWorld(src.plan, view, group, 0, 0);
      const pu = toWorld(src.plan, view, group, 1, 0);
      const pv = toWorld(src.plan, view, group, 0, 1);
      if (p0 && pu && pv) {
        od.current = {
          openingId: o.id, elId: opEl.getAttribute('data-el') ?? '', x: e.clientX, y: e.clientY, moved: false,
          mmpx: latest().w / Math.max(sizeRef.current.w, 1), group, type: o.type, startOffset: o.offset, startSill: o.sillHeight,
          v0: src.plan.walls.studSection.t, au: [pu[0] - p0[0], pu[1] - p0[1]], av: [pv[0] - p0[0], pv[1] - p0[1]],
          offset: o.offset, sill: o.sillHeight,
        };
        return;
      }
    }
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      drag.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
      if (ui.get().hovered !== null) ui.set({ hovered: null });
      setPanning(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (od.current && e.buttons === 0) finishOpening(false); // az egérgombot a vásznon kívül engedték fel
    const o = od.current;
    if (o) {
      const dxPx = e.clientX - o.x;
      const dyPx = e.clientY - o.y;
      if (!o.moved) {
        if (Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return; // kattintás, nem húzás
        o.moved = true;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        ui.set({ ...(o.elId ? { selected: o.elId } : {}), hovered: null });
      }
      const dx = dxPx * o.mmpx;
      const dy = dyPx * o.mmpx;
      const plan = src.plan;
      o.offset = dragOffset(plan, o.openingId, o.startOffset, dx * o.au[0] + dy * o.au[1]);
      o.sill = view.startsWith('wall.') ? dragSill(plan, o.openingId, o.startSill, dx * o.av[0] + dy * o.av[1], o.offset) : o.startSill;
      const [sx, sy] = shiftOf(plan, view, o.group, o.startOffset, o.v0 + o.startSill, o.offset, o.v0 + o.sill);
      for (const g of Array.from(svg.current?.querySelectorAll('[data-drawing] [data-opening-id]') ?? [])) {
        if (g.getAttribute('data-opening-id') === o.openingId) g.setAttribute('transform', `translate(${sx} ${sy})`);
      }
      setLive({ openingId: o.openingId, offset: o.offset, sill: o.sill });
      return;
    }
    const d = drag.current;
    if (d) {
      const { w, h } = sizeRef.current;
      moved.current = true;
      setCam(panBy(latest(), e.clientX - d.x, e.clientY - d.y, w, h));
      drag.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // ráállás: eseménydelegálás; mozgatás (szóköz) közben felfüggesztve
    const hit = space.current ? null : (e.target as Element | null)?.closest?.('[data-el],[data-fx]') ?? null;
    const id = hit ? (hit.getAttribute('data-fx') ?? hit.getAttribute('data-el')) : null;
    if (id !== ui.get().hovered) ui.set({ hovered: id });
    if (id) {
      const r = wrap.current?.getBoundingClientRect();
      const x = e.clientX - (r?.left ?? 0);
      const y = e.clientY - (r?.top ?? 0);
      pointer.current = { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
      tipMove.current?.(pointer.current);
    }
  };
  const onPointerLeave = () => { if (ui.get().hovered !== null) ui.set({ hovered: null }); };
  const finishOpening = (commit: boolean) => {
    const d = od.current;
    od.current = null;
    if (!d || !d.moved) return;
    moved.current = true; // a húzás utáni kattintás ne jelöljön ki
    for (const g of Array.from(svg.current?.querySelectorAll('[data-drawing] [data-opening-id]') ?? [])) {
      if (g.getAttribute('data-opening-id') === d.openingId) g.removeAttribute('transform');
    }
    setLive(null);
    if (!commit || (d.offset === d.startOffset && d.sill === d.startSill)) return;
    store.update(draft => {
      moveOpening(draft, d.openingId, d.offset);
      const o = draft.openings.find(x => x.id === d.openingId);
      if (o && o.type === 'window') o.sillHeight = d.sill;
    });
    selectOpening(store, ui, d.openingId); // a sorrend (és az elem-azonosító) változhatott
  };
  const endDrag = () => { finishOpening(true); drag.current = null; setPanning(false); };
  const cancelDrag = () => { finishOpening(false); drag.current = null; setPanning(false); };
  const pickType = (type: 'door' | 'window') => {
    const c = chooser;
    if (!c) return;
    setChooser(null);
    let id = '';
    store.update(draft => { id = addOpening(draft, c.side, type, c.pos).id; });
    selectOpening(store, ui, id, true);
  };

  const toggle = (id: keyof typeof layers) => ui.set({ layers: { ...layers, [id]: !layers[id] } });
  const viewLayers = VIEW_LAYERS[view];
  const showGrid = viewLayers.includes('grid') && layers.grid;

  return (
    <main class="viewer" aria-label="Nézet" style={paletteStyle(SCREEN_PALETTE)}>
      <div class="viewer-bar">
        <div class="view-switch" role="group" aria-label="Nézetek">
          {stepDef.views.map(v => (
            <button type="button" key={v} data-view={v} class={v === view ? 'active' : ''}
              aria-pressed={v === view} onClick={() => ui.set({ view: v })}>{VIEW_NAMES[v]}</button>
          ))}
        </div>
        <div class="layer-switch" role="group" aria-label="Rétegek">
          {viewLayers.map(l => (
            <label key={l}>
              <input type="checkbox" data-layer={l} checked={layers[l]} onChange={() => toggle(l)} /> {LAYER_NAMES[l]}
            </label>
          ))}
        </div>
      </div>
      <div class="viewer-canvas" ref={wrap}>
        <svg ref={svg} tabIndex={0} role="img" aria-label={VIEW_NAMES[view]}
          class={`${panning ? 'panning' : ''}${hovered ? ' hovering' : ''}${editing ? ' editable' : ''}`.trim()} style={{ '--mmpx': String(cam.w / Math.max(size.w, 1)) }}
          viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`} preserveAspectRatio="xMidYMid meet"
          onKeyDown={onKeyDown} onBlur={() => { space.current = false; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onClick={onClick}
          onPointerUp={endDrag} onPointerCancel={cancelDrag} onAuxClick={e => e.preventDefault()}>
          <defs>
            <pattern id="grid-minor" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--vw-gridMinor)" stroke-width="1" vector-effect="non-scaling-stroke" />
            </pattern>
            <pattern id="grid-major" width="1000" height="1000" patternUnits="userSpaceOnUse">
              <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--vw-gridMajor)" stroke-width="1" vector-effect="non-scaling-stroke" />
            </pattern>
          </defs>
          {showGrid && <g data-grid>
            <rect x={cam.x} y={cam.y} width={cam.w} height={cam.h} fill="url(#grid-minor)" />
            <rect x={cam.x} y={cam.y} width={cam.w} height={cam.h} fill="url(#grid-major)" />
          </g>}
          <g data-drawing dangerouslySetInnerHTML={{ __html: drawn.svg }} />
          <g data-overlay pointer-events="none" dangerouslySetInnerHTML={{ __html: overlay }} />
        </svg>
        {chooser && (
          <div class="opening-chooser" role="dialog" aria-label="Nyílászáró hozzáadása" style={{ left: `${chooser.x}px`, top: `${chooser.y}px` }}>
            <button type="button" onClick={() => pickType('door')}>Ajtó</button>
            <button type="button" onClick={() => pickType('window')}>Ablak</button>
          </div>
        )}
        {hovered && tipLines.length > 0 && <Tooltip lines={tipLines} initial={pointer.current} bind={tipMove} vpW={size.w} vpH={size.h} />}
        <div class="zoom-buttons">
          <button type="button" data-action="zoom-in" aria-label="Nagyítás" onClick={() => zoomCenter(1.15)}>+</button>
          <button type="button" data-action="zoom-out" aria-label="Kicsinyítés" onClick={() => zoomCenter(1 / 1.15)}>−</button>
          <button type="button" data-action="zoom-fit" aria-label="Teljes nézet" onClick={resetCam}>⤢</button>
        </div>
      </div>
    </main>
  );
}
