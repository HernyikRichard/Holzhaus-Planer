/** A mai időpont egyetlen forrása – a tesztek vi.setSystemTime-mal rögzítik. */
export function now(): Date {
  return new Date();
}

/** Hány naptári nap telt el az ISO dátum óta (a helyi mai naphoz képest). */
export function daysSince(iso: string, today: Date = now()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return 0;
  const a = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((b - a) / 86400000);
}
