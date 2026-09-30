import catalog from "./data/fc26-catalog.json" with { type: "json" };
import { matchesName, type SeedPlayer } from "@fcdn/shared";

export class Catalog {
  private all = catalog as SeedPlayer[];

  /** Every player in the FC26 database. Which of them a given room can still take is that room's
   *  business (see `excluding`), not the catalog's: a star of one of the five built-in clubs is a
   *  fine free agent in a room that doesn't use his club. */
  search(q: { q?: string; position?: string; club?: string; limit?: number }, excluding?: ReadonlySet<string>): SeedPlayer[] {
    let r = excluding ? this.all.filter(p => !excluding.has(p.id)) : this.all;
    if (q.q) r = r.filter(p => matchesName(p.name, q.q!));
    if (q.position) r = r.filter(p => p.position === q.position);
    if (q.club) { const s = q.club.toLowerCase(); r = r.filter(p => p.club.toLowerCase().includes(s)); }
    return r.sort((a, b) => b.value - a.value).slice(0, q.limit ?? 50);
  }

  byIds(ids: string[]): SeedPlayer[] {
    const set = new Set(ids);
    return this.all.filter(p => set.has(p.id));
  }

  /** The full FC26 database (all real clubs), for cross-checking an uploaded roster. */
  raw(): SeedPlayer[] { return this.all; }
}
