import type { ClubId, Position, SeedPlayer } from "../data/dataset.js";
export type { Position, ClubId };

export interface Player {
  id: string; name: string; position: Position;
  listedValue: number;      // current value; rises on transfer / successful defense
  originalValue: number;    // dataset value; target when released
  ownerId: string | null;   // null = pool
  lockedThisSeason: boolean;
  homeClub: ClubId | null;  // the club this player belongs to in the seed data (needed so addManager can stamp initial ownership)
}

export interface Manager {
  id: string; displayName: string; clubId: string;
  reserved: number; spendable: number;
}

export type ContestType = "pool-listing" | "release-listing" | "war";
export type ContestStatus = "listing" | "war" | "closed" | "voided";

export interface Quote { managerId: string; amount: number; at: number; }

export interface Contest {
  id: string; playerId: string; type: ContestType; status: ContestStatus;
  listerId: string | null;                 // opener of a listing
  quotes: Quote[];                         // history; last is current top
  quoteCounts: Record<string, number>;     // per-manager quotes used (cap 2)
  closesAt: number;                        // ms
}

export type LogEntry =
  | { t: "listing"; at: number; managerId: string; playerId: string; price: number; kind: ContestType }
  | { t: "bid"; at: number; contestId: string; managerId: string; amount: number }
  | { t: "win"; at: number; contestId: string; managerId: string; playerId: string; price: number }
  | { t: "release"; at: number; managerId: string; playerId: string; toValue: number }
  | { t: "void"; at: number; contestId: string; managerId: string; reason: string }
  | { t: "fine"; at: number; managerId: string; amount: number };

export interface RoomState {
  code: string; totalBudget: number;
  quoteTimerMs: number; draftClockMs: number;
  squadSizeCap: number | null;
  seasonNumber: number;
  status: "setup" | "live" | "closed";
  startedAt: number | null;
  managers: Record<string, Manager>;
  players: Record<string, Player>;
  contests: Record<string, Contest>;
  challenges: Record<string, number>;      // `${challenger}->${rival}` -> count
  log: LogEntry[];
  seq: number;                             // monotonic id source (no wall clock)
}

export const OVERCOMMIT_FINE = 25;
export const LISTING_MS = 120_000;         // 2-minute listing window

export function createRoom(opts: {
  code: string; totalBudget: number; seed: SeedPlayer[];
  quoteTimerMs?: number; squadSizeCap?: number | null;
}): RoomState {
  const players: Record<string, Player> = {};
  for (const p of opts.seed) {
    players[p.id] = {
      id: p.id, name: p.name, position: p.position,
      listedValue: p.value, originalValue: p.value,
      ownerId: null, lockedThisSeason: false,
      homeClub: p.clubId,
    };
  }
  return {
    code: opts.code, totalBudget: opts.totalBudget,
    quoteTimerMs: opts.quoteTimerMs ?? 300_000, draftClockMs: 3_600_000,
    squadSizeCap: opts.squadSizeCap ?? null,
    seasonNumber: 1, status: "setup", startedAt: null,
    managers: {}, players, contests: {}, challenges: {}, log: [], seq: 0,
  };
}

export function addManager(s: RoomState, m: { id: string; displayName: string; clubId: string }): RoomState {
  const players = { ...s.players };
  let reserved = 0;
  for (const p of Object.values(players)) {
    if (p.homeClub === m.clubId) {
      players[p.id] = { ...p, ownerId: m.id };
      reserved += p.listedValue;
    }
  }
  const manager: Manager = { ...m, reserved, spendable: s.totalBudget - reserved };
  return { ...s, players, managers: { ...s.managers, [m.id]: manager } };
}

export function addPoolPlayer(s: RoomState, p: SeedPlayer): RoomState {
  if (s.players[p.id]) return s; // already present — no-op, never overwrite
  return {
    ...s,
    players: {
      ...s.players,
      [p.id]: {
        id: p.id, name: p.name, position: p.position,
        listedValue: p.value, originalValue: p.value,
        ownerId: null, lockedThisSeason: false, homeClub: p.clubId,
      },
    },
  };
}
