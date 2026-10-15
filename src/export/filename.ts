/** Fájlnévhez használható szöveg: ékezetek nélkül, kisbetűvel, kötőjelekkel. */
export function planFileSlug(name: string): string {
  const s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'terv';
}
