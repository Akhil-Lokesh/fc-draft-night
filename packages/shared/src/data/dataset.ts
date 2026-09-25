import squads from "./seed/squads.json" with { type: "json" };

export type Position = "GK" | "DEF" | "MID" | "FWD";
/** Any real-world club slug — no longer limited to the 5 built-in clubs (a room can be seeded
 *  from an uploaded roster naming any club in the FC26 database). */
export type ClubId = string;
export interface SeedPlayer {
  id: string;
  name: string;
  position: Position;
  /** Exact FC slot (ST, CB, CDM, RW, ...) — richer than `position`'s 4-bucket grouping, used to
   *  place a squad on a pitch for the post-draft ground view. Missing for a synthetic player the
   *  database never heard of (uploaded roster typo, lower-league signing). */
  positionDetail?: string;
  /** Other real positions this player can play, most-to-least natural (e.g. Bellingham's CAM
   *  primary lists ["CM"]). Absent for a single-position player or a synthetic one. */
  altPositions?: string[];
  /** FC26's archetype tags (e.g. "Speedster", "Clinical finisher") — a quick read on this
   *  player's specialty, shown on the confirm card before challenging/listing them. Absent for
   *  a synthetic player the database never heard of. */
  tags?: string[];
  value: number;
  overall: number;
  club: string;
  clubId: ClubId | null;
  /** Squad number for this tournament, e.g. from a host-uploaded roster — the FC26 database
   *  itself doesn't carry these, so it's undefined outside of an uploaded roster. */
  shirtNumber?: number;
}

/** The five clubs' starting squads (what `shared` needs). */
export function loadSeed(): SeedPlayer[] {
  return squads as SeedPlayer[];
}

export function validateSeed(players: SeedPlayer[]): void {
  const ids = new Set<string>();
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  for (const p of players) {
    if (ids.has(p.id)) throw new Error(`duplicate id: ${p.id}`);
    ids.add(p.id);
    if (!positions.includes(p.position)) throw new Error(`bad position: ${p.id}`);
    if (!(p.value >= 0)) throw new Error(`bad value: ${p.id}`); // FC youth can be 0; only reject NaN/negative
  }
}

export function squadValue(players: SeedPlayer[], clubId: string): number {
  return players.filter(p => p.clubId === clubId).reduce((s, p) => s + p.value, 0);
}

export function budgetFloor(players: SeedPlayer[]): number {
  const clubs = new Set(players.map(p => p.clubId).filter((c): c is string => c != null));
  const priciest = Math.max(0, ...[...clubs].map(c => squadValue(players, c)));
  return Math.ceil(priciest / 100) * 100; // round up to next clean 100M
}
