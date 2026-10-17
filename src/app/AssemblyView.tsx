import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import type { Plan } from '../model/types';
import type { Scene } from '../scene/types';
import type { CalcOutput } from '../calc';
import { useStore, useUi } from './hooks';
import { sceneFor } from './selection';
import { buildAssembly, type AssemblyStep } from '../assembly/steps';
import { stepMaterial, stepSummary, TIMBER_NOTE } from '../assembly/material';
import { filterModel, stepOfSolid } from '../assembly/solids';
// a modell-építő nem húzza be a Three.js-t; a kirajzoló csak dinamikusan töltődik (use3dRenderer)
import { buildModel3d, type Model3d, type Solid } from '../three-d/model';
import { canRetry, rendererMessage, use3dRenderer, type Size3d } from './use3dRenderer';
// csak típus: a kirajzoló (és vele a Three.js) dinamikusan töltődik
import type { Renderer3d } from '../three-d/renderer';
import { formatCm, formatQty } from '../ui/format';

/** Ennél kisebb elmozdulás kattintás, nem forgatás. */
const CLICK_PX = 4;
/** A 3D terület becsült mérete, ha nincs elrendezés (jsdom). */
const FALLBACK_SIZE: Size3d = { w: 640, h: 400 };

interface Assembly { plan: Plan; scene: Scene; steps: AssemblyStep[] }

// A terv fagyasztott: az objektum azonossága (a kalkulációval együtt) érvényes gyorsítótár-kulcs.
const cache = new WeakMap<Plan, { output: CalcOutput; value: Assembly }>();
function assemblyFor(plan: Plan, output: CalcOutput): Assembly {
  const hit = cache.get(plan);
  if (hit && hit.output === output) return hit.value;
  const scene = sceneFor(plan);
  const value = { plan, scene, steps: buildAssembly(plan, scene, output) };
  cache.set(plan, { output, value });
  return value;
}

/** A lépések az utolsó érvényes tervből (mint a többi nézet). */
function useAssembly(store: Store): Assembly {
  const plan = useStore(store, s => s.lastValidPlan);
  const output = useStore(store, s => s.output);
  return assemblyFor(plan, output);
}

const clampIndex = (i: number, n: number): number => Math.max(0, Math.min(i, n - 1));

/** Az aktuális (létező) lépés indexe; tervváltozáskor a meglévő lépés követi magát, megszűnt lépésnél a legközelebbi. */
function useCurrentStep(ui: UiStore, steps: AssemblyStep[]): number {
  const raw = useUi(ui, s => s.assemblyStep);
  const cur = clampIndex(raw, steps.length);
  const prev = useRef(steps);
  useEffect(() => {
    const before = prev.current;
    prev.current = steps;
    let next = cur;
    if (before !== steps) {
      const id = before[clampIndex(raw, before.length)]?.id;
      const j = steps.findIndex(s => s.id === id);
      if (j >= 0) next = j;
    }
    if (next !== raw) ui.set({ assemblyStep: next });
  }, [steps, raw]);
  return cur;
}

/** A Szerelés lépés bal oldali listája (a beállítások paneljén). */
export function AssemblyStepList({ store, ui }: { store: Store; ui: UiStore }) {
  const { steps } = useAssembly(store);
  const cur = clampIndex(useUi(ui, s => s.assemblyStep), steps.length);
  return (
    <nav class="assembly-steps" aria-label="Szerelési lépések">
      <ol>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" data-assembly-step={i} class={i === cur ? 'active' : ''}
              aria-current={i === cur ? 'step' : undefined} onClick={() => ui.set({ assemblyStep: i })}>
              <span class="as-title">{i + 1}. {s.title}</span>
              <span class="as-sum">{stepSummary(s)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A 3D modell; hibánál naplóz és null. */
function tryBuild(plan: Plan, scene: Scene): Model3d | null {
  try {
    return buildModel3d(plan, scene);
  } catch (err) {
    console.error(err);
    return null;
  }
}

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
};

/** Ráállt / rögzített anyagsor: a lépéshez kötve, hogy lépésváltáskor magától elengedjen. */
interface RowRef { at: number; key: string }

/** A Szerelés lépés: beágyazott 3D (az eddig felépült rész, a lépés kiemelve), alatta anyag és teendők. */
export function AssemblyView({ store, ui }: { store: Store; ui: UiStore }) {
  const { plan, scene, steps } = useAssembly(store);
  const cur = useCurrentStep(ui, steps);
  const step = steps[cur] as AssemblyStep | undefined;
  const [hover, setHover] = useState<RowRef | null>(null);
  const [pin, setPin] = useState<RowRef | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);

  const model = useMemo(() => tryBuild(plan, scene), [plan, scene]);
  const solidStep = useMemo(() => {
    const m = new Map<Solid, number>();
    if (model) for (const s of model.solids) m.set(s, stepOfSolid(s, scene, steps));
    return m;
  }, [model, scene, steps]);
  const shown = useMemo(() => (model ? filterModel(model, cur, s => solidStep.get(s) ?? 0) : null), [model, solidStep, cur]);

  const material = useMemo(() => (step ? stepMaterial(step) : { lines: [], fasteners: [] }), [step]);
  /** Sor-kulcs → elemek (darabok és rögzítők; az anyagsoroknak nincs rajzi elemük). */
  const rowIds = useMemo(() => {
    const m = new Map<string, string[]>();
    step?.pieces.forEach((p, i) => m.set(`piece:${i}`, p.elementIds));
    step?.fasteners.forEach(f => m.set(`fx:${f.kind}`, f.elementIds));
    return m;
  }, [step]);
  const active = (r: RowRef | null) => (r && r.at === cur && rowIds.has(r.key) ? r.key : null);
  const activeRow = active(hover) ?? active(pin);
  const highlight = useMemo(() => (activeRow ? rowIds.get(activeRow)! : step?.elementIds ?? []), [activeRow, rowIds, step]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const hoverAt = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const modelRef = useRef(model);
  modelRef.current = model;
  /** Igazított-e már a kamera a teljes házra (kirajzolónként egyszer, az első modell után). */
  const framed = useRef(false);
  /** A kamera a teljes házra, nem a szűrt modellre: az 1. lépés se a lemezre nagyítson, a későbbiek se lógjanak ki. */
  const frameHouse = (r: Renderer3d): void => {
    if (framed.current || !modelRef.current || !shownRef.current) return;
    r.setView('persp', modelRef.current.bounds);
    framed.current = true;
  };

  const measure = (): Size3d => {
    const r = body.current?.getBoundingClientRect();
    const w = r && r.width > 0 ? r.width : FALLBACK_SIZE.w;
    const h = r && r.height > 0 ? r.height : FALLBACK_SIZE.h;
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  };
  const { status, renderer, attempt, retry } = use3dRenderer(canvas, {
    measure,
    init: r => {
      r.setHighlight(highlightRef.current);
      framed.current = false;
      if (shownRef.current) r.setModel(shownRef.current);
      frameHouse(r);
    },
    observe: body,
    onDispose: () => {
      if (hoverFrame.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = 0;
    },
  });

  // Lépésváltás / tervváltozás: a szűrt modell; a kamera csak az első modellnél igazodik (a teljes házra).
  useEffect(() => {
    const r = renderer.current;
    if (!r || !shown) return;
    r.setModel(shown);
    frameHouse(r);
  }, [shown]);
  useEffect(() => { renderer.current?.setHighlight(highlight); }, [highlight]);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const s = measure();
    r.resize(s.w, s.h);
  }, [status]);

  // ← → a dokumentumon, ha a fókusz nem beviteli mezőben van
  const countRef = useRef(steps.length);
  countRef.current = steps.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typing(e.target)) return;
      const s = ui.get();
      if (s.step !== 'assembly') return;
      const i = clampIndex(s.assemblyStep, countRef.current);
      const next = clampIndex(i + (e.key === 'ArrowLeft' ? -1 : 1), countRef.current);
      e.preventDefault();
      if (next !== s.assemblyStep) ui.set({ assemblyStep: next });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const goTo = (i: number) => ui.set({ assemblyStep: clampIndex(i, steps.length) });

  // 3D: kattintás (≤ 4 px) kijelöl és adatlapot nyit (a Szerelésben maradunk), húzás forgat
  const onCanvasDown = (e: PointerEvent) => { press.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
  const onCanvasUp = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    const r = renderer.current;
    if (!p || !r || Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_PX) return;
    const id = r.pick(e.clientX, e.clientY)?.elementId;
    if (id && scene.elements.some(x => x.id === id)) ui.set({ selected: id, detailOpen: true });
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
    if (e.buttons !== 0) { if (hoverAt.current) clearHover(); return; }
    hoverAt.current = { x: e.clientX, y: e.clientY };
    if (hoverFrame.current) return;
    if (typeof requestAnimationFrame === 'function') hoverFrame.current = requestAnimationFrame(doHover);
    else doHover();
  };

  /** Kiemelhető anyagsor: ráállás / fókusz kiemel, kattintás rögzít (újabb kattintás old). */
  const rowProps = (key: string) => {
    const pinned = active(pin) === key;
    return {
      'data-row': key, tabIndex: 0, role: 'button' as const, 'aria-pressed': pinned,
      class: `as-row hl${activeRow === key ? ' active' : ''}`,
      onMouseEnter: () => setHover({ at: cur, key }),
      onMouseLeave: () => setHover(null),
      onFocus: () => setHover({ at: cur, key }),
      onBlur: () => setHover(null),
      onClick: () => setPin(pinned ? null : { at: cur, key }),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPin(pinned ? null : { at: cur, key }); }
      },
    };
  };

  const message = rendererMessage(status, model !== null);
  const ready = status === 'ready';

  return (
    <main class="viewer assembly-area" aria-label="Szerelés">
      <div class="viewer-bar assembly-bar">
        <button type="button" data-action="assembly-prev" disabled={cur <= 0} onClick={() => goTo(cur - 1)}>← Előző</button>
        <h2 class="assembly-title">
          {step ? <>{cur + 1}. lépés / {steps.length}: {step.title}</> : 'Nincs szerelési lépés'}
        </h2>
        <button type="button" data-action="assembly-next" disabled={cur >= steps.length - 1} onClick={() => goTo(cur + 1)}>Következő →</button>
        <button type="button" data-action="assembly-view-reset" class="assembly-reset" title="A kamera alaphelyzetbe" disabled={!ready}
          onClick={() => renderer.current?.setView('persp', model?.bounds)}>⟲ Nézet</button>
      </div>
      <div class="assembly-body">
        <div class="w3d-body assembly-3d" ref={body}>
          <canvas key={attempt} ref={canvas} tabIndex={0} aria-label="3D modell a lépésig"
            onPointerDown={onCanvasDown} onPointerUp={onCanvasUp} onPointerMove={onCanvasMove} onPointerLeave={clearHover}
            onContextMenu={e => e.preventDefault()} />
          {tip && <div class="w3d-tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>{tip.label}</div>}
          {message !== null && (
            <div class="w3d-msg" role={status === 'loading' && model ? 'status' : 'alert'}>
              <span>{message}</span>
              {canRetry(status) && <button type="button" data-action="3d-retry" onClick={retry}>Újra</button>}
            </div>
          )}
        </div>
        {step && (
          <div class="assembly-info">
            <section class="assembly-material" aria-label="A lépés anyaga">
              <h3>Anyag</h3>
              {step.pieces.length > 0 && <p class="hint">{TIMBER_NOTE}</p>}
              {step.pieces.length > 0 && (
                <ul class="as-list">
                  {step.pieces.map((p, i) => (
                    <li key={i} {...rowProps(`piece:${i}`)}>
                      <span class="as-qty">{formatQty(p.count)} db</span>
                      <span class="as-name">{p.label} {p.section}, {formatCm(p.length)}</span>
                      <span class="as-cut">{p.cut}</span>
                    </li>
                  ))}
                </ul>
              )}
              {material.fasteners.length > 0 && (
                <ul class="as-list">
                  {material.fasteners.map(f => (
                    <li key={f.kind} {...rowProps(`fx:${f.kind}`)}>
                      <span class="as-qty">{formatQty(f.count)} db</span>
                      <span class="as-name">{f.label}</span>
                      {f.order && <span class="as-order">{f.order}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {material.lines.length > 0 && (
                <ul class="as-list">
                  {material.lines.map(l => (
                    <li key={l.lineId} class="as-row" data-line={l.lineId}>
                      <span class="as-qty">{formatQty(l.quantity)} {l.unit}</span>
                      <span class="as-name">{l.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {step.pieces.length + material.fasteners.length + material.lines.length === 0 && (
                <p class="hint">Ehhez a lépéshez nincs külön anyag.</p>
              )}
            </section>
            <section class="assembly-todo-box" aria-label="Teendők">
              <h3>Teendők</h3>
              <ol class="assembly-todo">
                {step.todo.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
