import catalog from "./data/fc26-catalog.json" with { type: "json" };
import type { SeedPlayer } from "@fcdn/shared";

export class Catalog {
  private all = catalog as SeedPlayer[];

  search(q: { q?: string; position?: string; club?: string; limit?: number }): SeedPlayer[] {
    let r = this.all.filter(p => p.clubId === null); // only pool-eligible (non-tournament-club)
    if (q.q) { const s = q.q.toLowerCase(); r = r.filter(p => p.name.toLowerCase().includes(s)); }
    if (q.position) r = r.filter(p => p.position === q.position);
    if (q.club) { const s = q.club.toLowerCase(); r = r.filter(p => p.club.toLowerCase().includes(s)); }
    return r.sort((a, b) => b.value - a.value).slice(0, q.limit ?? 50);
  }

  byIds(ids: string[]): SeedPlayer[] {
    const set = new Set(ids);
    return this.all.filter(p => set.has(p.id));
  }
}
