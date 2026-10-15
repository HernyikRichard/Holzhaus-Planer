import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import { createDirtyTracker } from './dirty';
import { createDefaultPlan } from '../model/defaults';
import { parsePlan, serializePlan } from '../model/serialize';
import { toCsv, toOrderCsv } from '../export/csv';
import { BUNDLED_PRICE_LIST } from '../prices';
import { computeCost } from './useCost';
import { planFileSlug } from '../export/filename';
import { downloadBlob } from '../export/download';
import { STEPS, stepHasError } from './steps';
import { CLEAR_UI, type UiStore } from './uiStore';
import { useStore, useUi } from './hooks';

function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function PdfDialog({ store, dialogRef }: { store: Store; dialogRef: { current: HTMLDialogElement | null } }) {
  const [busy, setBusy] = useState(false);
  const [materialsOn, setMaterialsOn] = useState(true);
  const drawings = useRef<HTMLInputElement>(null);
  const materials = useRef<HTMLInputElement>(null);
  const explanations = useRef<HTMLInputElement>(null);
  const cutPlan = useRef<HTMLInputElement>(null);
  const costBox = useRef<HTMLInputElement>(null);

  const close = () => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  };

  async function create(): Promise<void> {
    setBusy(true);
    try {
      const state = store.get();
      const { lastValidPlan, output } = state;
      // az utolsó érvényes geometria az aktuális árazási beállításokkal (a szállítás felirata is ebből)
      const { plan, cost } = computeCost(state, BUNDLED_PRICE_LIST);
      const { exportPdf } = await import('../export/pdf');
      const blob = await exportPdf(plan, output, {
        drawings: drawings.current!.checked,
        materials: materials.current!.checked,
        explanations: materials.current!.checked && explanations.current!.checked,
        cutPlan: cutPlan.current!.checked,
        cost: costBox.current!.checked,
      }, cost);
      downloadBlob(blob, `${planFileSlug(lastValidPlan.name)}.pdf`);
      close();
    } catch (err) {
      console.error(err);
      window.alert('A PDF létrehozása nem sikerült.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} class="pdf-dialog" onCancel={(e: Event) => { if (busy) e.preventDefault(); }}>
      <h2>PDF készítése</h2>
      <label><input type="checkbox" name="drawings" ref={drawings} defaultChecked /> Rajzok</label>
      <label><input type="checkbox" name="materials" ref={materials} defaultChecked
        onChange={() => setMaterialsOn(materials.current!.checked)} /> Anyaglista</label>
      <label><input type="checkbox" name="explanations" ref={explanations} defaultChecked
        disabled={!materialsOn} /> Számítás oszlop</label>
      <label><input type="checkbox" name="cutPlan" ref={cutPlan} defaultChecked /> Vágási terv</label>
      <label><input type="checkbox" name="cost" ref={costBox} defaultChecked /> Költség</label>
      <div class="pdf-dialog-buttons">
        <button type="button" data-action="pdf-create" disabled={busy} onClick={create}>
          {busy ? 'PDF készül…' : 'Létrehozás'}
        </button>
        <button type="button" data-action="pdf-cancel" disabled={busy} onClick={close}>Mégse</button>
      </div>
    </dialog>
  );
}

export function TopBar({ store, ui }: { store: Store; ui: UiStore }) {
  const errors = useStore(store, s => s.errors);
  const step = useUi(ui, s => s.step);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useRef<ReturnType<typeof createDirtyTracker>>();
  if (!dirty.current) dirty.current = createDirtyTracker(store);
  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pdfDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current!.isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // A név mező kövesse a tervet (Új terv, Megnyitás), de gépelés közben ne írjuk felül.
  useEffect(() => {
    const sync = () => {
      const el = nameInput.current;
      if (el && document.activeElement !== el) el.value = store.get().plan.name;
    };
    sync();
    return store.subscribe(sync);
  }, [store]);

  const onNew = () => {
    if (!window.confirm('Biztosan új tervet kezdesz? A nem mentett módosítások elvesznek.')) return;
    setMessage(null);
    ui.set(CLEAR_UI);
    store.replace(createDefaultPlan());
    dirty.current!.markClean();
  };
  const onSave = () => {
    const plan = store.get().plan;
    downloadBlob(new Blob([serializePlan(plan)], { type: 'application/json' }), `${planFileSlug(plan.name)}.json`);
    dirty.current!.markClean();
  };
  const onCsv = () => {
    const state = store.get();
    const { plan, output } = state;
    downloadBlob(new Blob([toCsv(output.lines, computeCost(state, BUNDLED_PRICE_LIST).cost ?? undefined)], { type: 'text/csv;charset=utf-8' }),
      `${planFileSlug(plan.name)}-anyaglista.csv`);
  };
  const onOrderCsv = () => {
    const state = store.get();
    const { cost } = computeCost(state, BUNDLED_PRICE_LIST);
    if (!cost) { setMessage('Nincs árlista, a rendelési lista nem készíthető.'); return; }
    downloadBlob(new Blob([toOrderCsv(cost)], { type: 'text/csv;charset=utf-8' }),
      `${planFileSlug(state.plan.name)}-rendeles.csv`);
  };
  const onFile = () => {
    const input = fileInput.current!;
    const file = input.files?.[0];
    if (!file) return;
    readText(file).then(text => {
      try {
        const r = parsePlan(text);
        if (!r.ok) { setMessage(r.error); return; }
        store.replace(r.plan);
        dirty.current!.markClean();
        ui.set(CLEAR_UI);
        setMessage(null);
      } catch {
        setMessage('A terv betöltése nem sikerült.');
      }
    }, () => setMessage('A fájl nem olvasható.')).finally(() => { input.value = ''; });
  };
  const onPdf = () => {
    const dlg = pdfDialog.current!;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  };

  return (
    <header class="topbar">
      <h1 class="brand">Favázas tervező</h1>
      <nav class="steps" aria-label="Lépések">
        {STEPS.map((s, i) => {
          const bad = stepHasError(s.id, errors);
          return (
            <button type="button" key={s.id} data-step={s.id} class={`step${s.id === step ? ' active' : ''}`}
              aria-current={s.id === step ? 'step' : undefined}
              onClick={() => ui.set({ step: s.id })}>
              <span class="step-no">{i + 1}</span> {s.title}
              {bad
                ? <span class="badge badge-error" role="img" aria-label="hibás mező"></span>
                : <span class="badge badge-ok" role="img" aria-label="rendben">✓</span>}
            </button>
          );
        })}
      </nav>
      <div class="actions">
        <label class="plan-name">Terv neve{' '}
          <input type="text" ref={nameInput} defaultValue={store.get().plan.name}
            onChange={e => { const v = (e.currentTarget as HTMLInputElement).value; store.update(p => { p.name = v; }); }} />
        </label>
        <button type="button" data-action="new" onClick={onNew}>Új</button>
        <button type="button" data-action="save" onClick={onSave}>Mentés</button>
        <button type="button" data-action="load" onClick={() => fileInput.current!.click()}>Megnyitás</button>
        <button type="button" data-action="csv" onClick={onCsv}>CSV</button>
        <button type="button" data-action="order-csv" onClick={onOrderCsv}>Rendelési lista CSV</button>
        <button type="button" data-action="pdf" onClick={onPdf}>PDF</button>
        <input type="file" accept=".json" hidden ref={fileInput} onChange={onFile} />
      </div>
      {message !== null && (
        <div class="toolbar-error" role="alert">
          <span>{message}</span>
          <button type="button" data-action="dismiss" aria-label="Üzenet bezárása" onClick={() => setMessage(null)}>×</button>
        </div>
      )}
      <PdfDialog store={store} dialogRef={pdfDialog} />
    </header>
  );
}
