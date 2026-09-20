import squads from "./seed/squads.json" with { type: "json" };

export type Position = "GK" | "DEF" | "MID" | "FWD";
export type ClubId = "arsenal" | "bayern" | "real" | "barca" | "city";
export interface SeedPlayer {
  id: string;
  name: string;
  position: Position;
  value: number;
  overall: number;
  club: string;
  clubId: ClubId | null;
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
  const clubs = ["arsenal", "bayern", "real", "barca", "city"];
  const priciest = Math.max(...clubs.map(c => squadValue(players, c)));
  return Math.ceil(priciest / 100) * 100; // round up to next clean 100M
}
