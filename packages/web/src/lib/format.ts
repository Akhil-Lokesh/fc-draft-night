/** Money in millions: whole numbers bare, otherwise one decimal. The "€" glyph is a CSS ::before. */
export function money(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return `${s}M`;
}

/** Remaining time as m:ss, clamped at zero (a closed contest reads 0:00, never negative). */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
