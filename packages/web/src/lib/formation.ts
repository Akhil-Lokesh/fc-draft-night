import type { Player } from "@fcdn/shared";
import formationsData from "../data/formations.json" with { type: "json" };

interface Formation { name: string; positions: string[] }
/** EA's own FC26 in-game formation shapes — a small known set, so we pick the best fit per
 *  squad rather than invent one. */
const FORMATIONS = (formationsData as { formations: Formation[] }).formations;

/** Pitch anchor per formation slot. y=92 is our own goal, y=10 the opponent's. Repeats of one
 *  code in a formation (3×CB, 2×ST) fan out around the anchor — see coordsFor. */
const BASE_COORD: Record<string, { x: number; y: number }> = {
  GK: { x: 50, y: 92 },
  LB: { x: 12, y: 74 }, CB: { x: 50, y: 78 }, RB: { x: 88, y: 74 },
  LWB: { x: 8, y: 64 }, RWB: { x: 92, y: 64 },
  CDM: { x: 50, y: 60 },
  LCM: { x: 32, y: 48 }, CM: { x: 50, y: 48 }, RCM: { x: 68, y: 48 },
  LM: { x: 10, y: 48 }, RM: { x: 90, y: 48 },
  LAM: { x: 32, y: 36 }, CAM: { x: 50, y: 36 }, RAM: { x: 68, y: 36 },
  LW: { x: 14, y: 18 }, RW: { x: 86, y: 18 },
  CF: { x: 50, y: 16 }, ST: { x: 50, y: 10 },
};

/** Sided central codes don't exist in the player data (FC26 tags plain CM/CAM) — alias them for
 *  matching; the formation code still drives the coordinate. */
const ALIAS: Record<string, string> = { RCM: "CM", LCM: "CM", RAM: "CAM", LAM: "CAM" };
const exactKeyOf = (code: string) => ALIAS[code] ?? code;

const BUCKET_OF: Record<string, Player["position"]> = {
  GK: "GK",
  LB: "DEF", CB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID",
  LW: "FWD", ST: "FWD", RW: "FWD", CF: "FWD",
};
const BUCKET_FALLBACK: Record<Player["position"], string> = { GK: "GK", DEF: "CB", MID: "CM", FWD: "ST" };

function slotOf(p: Player): string {
  return p.positionDetail && BUCKET_OF[p.positionDetail] ? p.positionDetail : BUCKET_FALLBACK[p.position];
}

export interface PlacedPlayer { player: Player; x: number; y: number; code: string }
interface Attempt { placed: { code: string; player: Player }[]; exactCount: number }

function attemptFormation(
  codes: string[],
  byExactSlot: Map<string, Player[]>,
  byBucket: Map<Player["position"], Player[]>,
): Attempt {
  const used = new Set<string>();
  const placed: { code: string; player: Player }[] = [];
  let exactCount = 0;
  for (const code of codes) {
    const key = exactKeyOf(code);
    const exactPick = byExactSlot.get(key)?.find((p) => !used.has(p.id));
    const pick = exactPick ?? byBucket.get(BUCKET_OF[key]!)?.find((p) => !used.has(p.id));
    if (!pick) continue;
    used.add(pick.id);
    placed.push({ code, player: pick });
    if (exactPick) exactCount++;
  }
  return { placed, exactCount };
}

function buildQueues(players: Player[]) {
  const byExactSlot = new Map<string, Player[]>();
  const byBucket = new Map<Player["position"], Player[]>();
  for (const p of players) {
    const slot = slotOf(p);
    (byExactSlot.get(slot) ?? byExactSlot.set(slot, []).get(slot)!).push(p);
    (byBucket.get(p.position) ?? byBucket.set(p.position, []).get(p.position)!).push(p);
  }
  for (const g of byExactSlot.values()) g.sort((a, b) => b.listedValue - a.listedValue);
  for (const g of byBucket.values()) g.sort((a, b) => b.listedValue - a.listedValue);
  return { byExactSlot, byBucket };
}

/** Try every formation; keep the one with the most exact-slot matches (ties -> first listed,
 *  so a base shape beats its "(2)" variant). */
function pickBestFormation(players: Player[]): Attempt & { name: string } {
  const { byExactSlot, byBucket } = buildQueues(players);
  let best: (Attempt & { name: string }) | null = null;
  for (const f of FORMATIONS) {
    const a = attemptFormation(f.positions, byExactSlot, byBucket);
    if (!best || a.exactCount > best.exactCount) best = { ...a, name: f.name };
  }
  return best!;
}

export function chooseFormation(players: Player[]): string {
  return pickBestFormation(players).name;
}

function coordsFor(codes: string[]): { x: number; y: number }[] {
  const idxByCode = new Map<string, number[]>();
  codes.forEach((c, i) => (idxByCode.get(c) ?? idxByCode.set(c, []).get(c)!).push(i));
  const out: { x: number; y: number }[] = new Array(codes.length);
  for (const [code, idxs] of idxByCode) {
    const base = BASE_COORD[code] ?? BASE_COORD.CM!;
    idxs.forEach((idx, i) => {
      const offset = idxs.length > 1 ? (i - (idxs.length - 1) / 2) * 20 : 0;
      out[idx] = { x: Math.min(94, Math.max(6, base.x + offset)), y: base.y };
    });
  }
  return out;
}

export function layoutSquad(players: Player[]): PlacedPlayer[] {
  const { placed } = pickBestFormation(players);
  const coords = coordsFor(placed.map((pl) => pl.code));
  return placed.map((pl, i) => ({ player: pl.player, code: pl.code, x: coords[i]!.x, y: coords[i]!.y }));
}

/** Everyone not starting, priciest first. */
export function benchOf(players: Player[]): Player[] {
  const starters = new Set(pickBestFormation(players).placed.map((pl) => pl.player.id));
  return players.filter((p) => !starters.has(p.id)).sort((a, b) => b.listedValue - a.listedValue);
}
