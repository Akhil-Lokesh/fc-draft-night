import type { ClubId, Position, SeedPlayer } from "../data/dataset.js";
import { colorForClub } from "./colors.js";
export type { Position, ClubId };

export interface Player {
  id: string; name: string; position: Position;
  /** Exact FC slot (ST, CB, CDM, RW, ...), for placing this player on the post-draft pitch view. */
  positionDetail?: string;
  /** Other real positions this player can play, most-to-least natural. */
  altPositions?: string[];
  /** FC26's archetype tags (e.g. "Speedster", "Clinical finisher") — this player's specialty. */
  tags?: string[];
  /** FC26 overall rating (0-99). Optional so a synthetic/uploaded-roster player without one
   *  (or an older fixture) still satisfies this type. */
  overall?: number;
  listedValue: number;      // current value; rises on transfer / successful defense
  originalValue: number;    // dataset value; target when released
  ownerId: string | null;   // null = pool
  lockedThisSeason: boolean;
  homeClub: ClubId | null;  // the club this player belongs to in the seed data (needed so addManager can stamp initial ownership)
  /** Squad number from an uploaded tournament roster, if the host supplied one. Optional so
   *  every existing fixture/seed without shirt numbers still satisfies this type. */
  shirtNumber?: number;
}
export interface Manager {
  id: string; displayName: string; clubId: string;
  reserved: number; spendable: number;
  /** TEAM_PALETTE id, unique within the room (see colors.ts). Optional for rooms saved before. */
  colorId?: string;
  /** A stand-in seat the server filled when a test room started short of players. Nobody can join
   *  it; the host plays it by switching seats (see RoomState.testMode). */
  practice?: boolean;
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

/** Still running — not yet resolved or voided. */
export function isOpenContest(c: Contest): boolean {
  return c.status === "listing" || c.status === "war";
}

/** Whether a player already has a running contest against them — a listing or challenge can't
 *  be opened on top of one, or two independent resolutions could both try to move ownership. */
export function hasOpenContest(s: RoomState, playerId: string): boolean {
  return Object.values(s.contests).some((c) => c.playerId === playerId && isOpenContest(c));
}

export type LogEntry =
  | { t: "listing"; at: number; managerId: string; playerId: string; price: number; kind: ContestType }
  | { t: "bid"; at: number; contestId: string; managerId: string; amount: number }
  | { t: "win"; at: number; contestId: string; managerId: string; playerId: string; price: number }
  /** A release-listing nobody else bid on: the player stays with the same manager (now locked),
   *  no money moves. Kept distinct from "win" so recaps/spend totals/the feed don't read a no-op
   *  as a real purchase — see resolution.ts's applyWin. */
  | { t: "unsold"; at: number; contestId: string; managerId: string; playerId: string; price: number }
  | { t: "release"; at: number; managerId: string; playerId: string; toValue: number }
  | { t: "void"; at: number; contestId: string; managerId: string; reason: string }
  | { t: "fine"; at: number; managerId: string; amount: number };

export interface RoomState {
  code: string; totalBudget: number;
  quoteTimerMs: number; draftClockMs: number;
  squadSizeCap: number | null;
  capacity: number;
  /** clubId -> real-world display name (e.g. "atletico-madrid" -> "Atlético Madrid"). Populated
   *  from whatever seed/roster built this room, since clubs are no longer a fixed built-in set. */
  clubNames: Record<string, string>;
  /** clubId -> starting budget override (e.g. from a prior season's finishing position).
   *  A club absent here just uses `totalBudget`, same as before this existed. */
  clubBudgets: Record<string, number>;
  seasonNumber: number;
  /** A solo-testing room: the host may start without a full room (empty seats become practice
   *  managers) and may act as any seat. Set only when the room is created; ordinary rooms never have it. */
  testMode?: boolean;
  status: "setup" | "live" | "closed";
  startedAt: number | null;
  /** Manager who created the room (the first to join). Optional: rooms saved before this existed
   *  fall back to their first manager — see hostOf. */
  hostId?: string | null;
  /** Managers asking the host's permission to walk out of the lobby. */
  leaveRequests?: string[];
  /** sha256 of the secret the server handed the room's creator. Whoever joins carrying it becomes
   *  host (then it's cleared). SERVER-ONLY, stripped like seatKeys. */
  hostKeyHash?: string;
  /** managerId -> sha256 of that seat's secret rejoin key. SERVER-ONLY: stripped from every state
   *  sent to clients (server/src/seats.ts publicState). */
  seatKeys?: Record<string, string>;
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
  quoteTimerMs?: number; squadSizeCap?: number | null; capacity?: number;
  seasonNumber?: number; clubBudgets?: Record<string, number>; testMode?: boolean;
}): RoomState {
  const players: Record<string, Player> = {};
  const clubNames: Record<string, string> = {};
  for (const p of opts.seed) {
    players[p.id] = {
      id: p.id, name: p.name, position: p.position, positionDetail: p.positionDetail,
      altPositions: p.altPositions, tags: p.tags, overall: p.overall,
      listedValue: p.value, originalValue: p.value,
      ownerId: null, lockedThisSeason: false,
      homeClub: p.clubId, shirtNumber: p.shirtNumber,
    };
    if (p.clubId) clubNames[p.clubId] = p.club;
  }
  return {
    code: opts.code, totalBudget: opts.totalBudget,
    quoteTimerMs: opts.quoteTimerMs ?? 300_000, draftClockMs: 3_600_000,
    squadSizeCap: opts.squadSizeCap ?? null,
    capacity: opts.capacity ?? 5,
    clubNames,
    clubBudgets: opts.clubBudgets ?? {},
    seasonNumber: opts.seasonNumber ?? 1, status: "setup", startedAt: null,
    ...(opts.testMode ? { testMode: true } : {}),
    managers: {}, players, contests: {}, challenges: {}, log: [], seq: 0,
  };
}

export function addManager(s: RoomState, m: { id: string; displayName: string; clubId: string }): RoomState {
  const players = { ...s.players };
  let reserved = 0;
  for (const p of Object.values(players)) {
    // Never take a player someone else already holds: only the club's still-unowned squad joins this manager.
    if (p.homeClub === m.clubId && !p.ownerId) {
      players[p.id] = { ...p, ownerId: m.id };
      reserved += p.listedValue;
    }
  }
  const budget = s.clubBudgets[m.clubId] ?? s.totalBudget;
  const colorId = colorForClub(s, m.clubId, Object.values(s.managers).flatMap((x) => (x.colorId ? [x.colorId] : [])));
  const manager: Manager = { ...m, reserved, spendable: budget - reserved, colorId };
  // A room created through the gateway waits for its creator's host key (see hostKeyHash); only a
  // room built without one (older saves, direct store use) falls back to "first manager in".
  const hostId = s.hostId ?? (s.hostKeyHash ? null : m.id);
  return { ...s, hostId, players, managers: { ...s.managers, [m.id]: manager } };
}

/** The room's host: whoever joined holding the creator's host key. Rooms saved before that
 *  existed fall back to their first manager. While the creator hasn't joined yet, nobody is. */
export function hostOf(s: RoomState): string | null {
  if (s.hostId) return s.hostId;
  if (s.hostKeyHash) return null;
  return Object.keys(s.managers)[0] ?? null;
}

/** A non-host manager asks to leave the lobby; only the host can let them go (resolveLeave). */
export function requestLeave(s: RoomState, managerId: string): RoomState {
  if (s.status !== "setup") throw new Error("the draft has started — nobody can leave until the host ends it");
  if (!s.managers[managerId]) throw new Error("not in this room");
  if (hostOf(s) === managerId) throw new Error("the host doesn't need permission to leave");
  const pending = s.leaveRequests ?? [];
  return pending.includes(managerId) ? s : { ...s, leaveRequests: [...pending, managerId] };
}

/** Take back a leave request before the host has answered it. */
export function cancelLeave(s: RoomState, managerId: string): RoomState {
  return { ...s, leaveRequests: (s.leaveRequests ?? []).filter((id) => id !== managerId) };
}

/** Host answers a leave request. Allowing it removes the manager outright — their club's players
 *  go back to unowned, so the seat and club are free for someone else to join as. */
export function resolveLeave(s: RoomState, hostId: string, managerId: string, allow: boolean): RoomState {
  if (hostOf(s) !== hostId) throw new Error("only the host can answer a leave request");
  if (!(s.leaveRequests ?? []).includes(managerId)) throw new Error("no such leave request");
  const next = cancelLeave(s, managerId);
  if (!allow) return next;
  if (s.status !== "setup") throw new Error("the draft has started — nobody can leave until the host ends it");
  const players = { ...next.players };
  for (const p of Object.values(players)) if (p.ownerId === managerId) players[p.id] = { ...p, ownerId: null };
  const { [managerId]: _gone, ...managers } = next.managers;
  const { [managerId]: _key, ...seatKeys } = next.seatKeys ?? {};
  return { ...next, players, managers, seatKeys };
}

export function addPoolPlayer(s: RoomState, p: SeedPlayer): RoomState {
  if (s.players[p.id]) return s; // already present — no-op, never overwrite
  // Deliberately does NOT touch clubNames: that map means "clubs a manager can pick", and a
  // pool player's club was never meant to be pickable — just extra unowned talent up for grabs.
  return {
    ...s,
    players: {
      ...s.players,
      [p.id]: {
        id: p.id, name: p.name, position: p.position, positionDetail: p.positionDetail,
        altPositions: p.altPositions, tags: p.tags, overall: p.overall,
        listedValue: p.value, originalValue: p.value,
        ownerId: null, lockedThisSeason: false, homeClub: p.clubId, shirtNumber: p.shirtNumber,
      },
    },
  };
}
