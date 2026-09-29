import { randomBytes } from "node:crypto";
import {
  createRoom, addManager, addPoolPlayer, squadValue, positionStepBudgets, startNextSeason, MAX_MANAGERS,
  type RoomState, type SeedPlayer, type ClubId,
} from "@fcdn/shared";
import type { Queue } from "./queue.js";
import type { Db } from "./db.js";
import { parseFinishingOrder } from "./import.js";
import { parseRosterCsv, parseTournamentCsv, type TournamentRoster } from "./roster.js";
import { starsFor, budgetForStars } from "./clubStars.js";

const isTournamentCsv = (csv: string): boolean => /^##\s*SQUADS/im.test(csv);

/** Every club's budget comes from its real-world FC26 star rating (see clubStars.ts) whenever
 *  a roster is uploaded — a 5-star club plays with far more than a lower-tier one. A club the
 *  ratings file has never heard of falls back to the host's flat totalBudget instead of a guess. */
function budgetsFromRoster(seed: SeedPlayer[], fallback: number): Record<string, number> {
  const clubNameById = new Map<string, string>();
  for (const p of seed) if (p.clubId && !clubNameById.has(p.clubId)) clubNameById.set(p.clubId, p.club);
  const budgets: Record<string, number> = {};
  for (const [clubId, clubName] of clubNameById) {
    const stars = starsFor(clubName);
    budgets[clubId] = stars !== null ? budgetForStars(stars) : fallback;
  }
  return budgets;
}

/** Random, not sequential: a counting code (R001K, R001L…) let anyone walk the live rooms.
 *  No 0/O/1/I so a code read out across the table can't be misheard. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function defaultCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Room codes that never collide with a room already saved in the DB. `Db.save` upserts, so a
 *  repeated code (a random clash, or the old counter restarting at "R0001" after a restart) would
 *  silently overwrite the saved room. */
export function uniqueCode(db: Db, next: () => string = defaultCode): () => string {
  return () => {
    for (let i = 0; i < 100_000; i++) {
      const code = next();
      if (!db.has(code)) return code;
    }
    throw new Error("ran out of room codes");
  };
}

export class RoomStore {
  constructor(
    private q: Queue<RoomState>, private db: Db, private seed: SeedPlayer[],
    private gen: () => string = defaultCode, private fullCatalog: SeedPlayer[] = [],
  ) {}

  get(code: string) { return this.q.getState(code); }

  /** Room capacity ceiling: the distinct real clubs the seed has squads for, and never more than
   *  MAX_MANAGERS (one per team colour). */
  private maxCapacity(seed: SeedPlayer[]): number {
    return Math.min(MAX_MANAGERS, new Set(seed.map(p => p.clubId).filter((c): c is ClubId => c != null)).size);
  }

  async create(opts: { totalBudget: number; quoteTimerMs?: number; squadSizeCap?: number | null; capacity?: number; rosterCsv?: string }): Promise<{ code: string }> {
    // An uploaded roster replaces the built-in 5-club seed entirely, so a room can be any real
    // club(s) in the FC26 database — every player in it has already been cross-checked.
    let seed = this.seed;
    let poolSeed: SeedPlayer[] = [];
    let tournament: TournamentRoster | null = null;
    if (opts.rosterCsv) {
      if (isTournamentCsv(opts.rosterCsv)) {
        tournament = parseTournamentCsv(opts.rosterCsv, this.fullCatalog);
        seed = tournament.seed;
        poolSeed = tournament.poolSeed;
      } else {
        seed = parseRosterCsv(opts.rosterCsv, this.fullCatalog);
      }
    }

    const max = this.maxCapacity(seed);
    if (opts.capacity !== undefined && (opts.capacity < 2 || opts.capacity > max)) {
      throw new Error(`capacity must be between 2 and ${max}`);
    }

    // A prior season's finishing position can give each club a different starting budget
    // (positionStepBudgets, worst-to-best) — so the floor check must be per-club here, not one
    // flat number: every club's OWN budget must cover its OWN squad's value.
    const clubBudgets = tournament?.finishingOrder.length
      ? positionStepBudgets(tournament.finishingOrder, opts.totalBudget, tournament.budgetStep)
      : opts.rosterCsv
        ? budgetsFromRoster(seed, opts.totalBudget)
        : {};
    for (const clubId of new Set(seed.map(p => p.clubId).filter((c): c is ClubId => c != null))) {
      const budget = clubBudgets[clubId] ?? opts.totalBudget;
      const need = squadValue(seed, clubId);
      if (budget < need) throw new Error(`budget too low for "${clubId}" (needs at least ${need})`);
    }

    const code = this.gen();
    let s = createRoom({
      code, totalBudget: opts.totalBudget, seed, quoteTimerMs: opts.quoteTimerMs, squadSizeCap: opts.squadSizeCap,
      capacity: opts.capacity ?? max, seasonNumber: tournament?.seasonNumber, clubBudgets,
    });
    for (const p of poolSeed) s = addPoolPlayer(s, p);
    this.q.setState(code, s);
    this.db.save(s);
    return { code };
  }

  async join(code: string, m: { displayName: string; clubId: string }): Promise<{ managerId: string }> {
    const managerId = `m_${m.clubId}`;
    const { state } = await this.q.run(code, (s) => {
      if (!s) throw new Error("no such room");
      if (Object.values(s.managers).some(x => x.clubId === m.clubId)) throw new Error("club taken");
      if (Object.keys(s.managers).length >= s.capacity) throw new Error("room full");
      return { state: addManager(s, { id: managerId, ...m }), events: [] };
    });
    this.db.save(state);
    return { managerId };
  }

  /** Run an arbitrary command/reducer against this room through the queue, without reaching into private internals. */
  async run(code: string, reducer: (s: RoomState) => { state: RoomState; events: unknown[] }): Promise<RoomState> {
    const { state } = await this.q.run(code, reducer);
    this.db.save(state);
    return state;
  }

  async applyHandoff(code: string, csv: string, opts: { base: number; step: number }): Promise<RoomState> {
    const finishingOrder = parseFinishingOrder(csv);
    const { state } = await this.q.run(code, (s) => ({ state: startNextSeason(s, { finishingOrder, ...opts }), events: [] }));
    this.db.save(state);
    return state;
  }

  loadFrom(db: Db) { for (const s of db.loadAll()) this.q.setState(s.code, s); }
}
