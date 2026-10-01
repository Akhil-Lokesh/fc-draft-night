import { randomBytes } from "node:crypto";
import {
  createRoom, addManager, addPoolPlayer, startNextSeason, squadValue, MAX_MANAGERS, FIVE_STAR_BUDGET, STANDING_BONUS,
  type RoomState, type SeedPlayer, type ClubId,
} from "@fcdn/shared";
import type { Queue } from "./queue.js";
import type { Db } from "./db.js";
import { parseFinishingOrder, parseTeamsFinishingOrder } from "./import.js";
import { slugifyClub, normalizeForMatch } from "./clubs.js";
import { parseRosterCsv, parseTournamentCsv, type TournamentRoster } from "./roster.js";
import { starsFor, budgetForStars } from "./clubStars.js";

const isTournamentCsv = (csv: string): boolean => /^##\s*SQUADS/im.test(csv);

/** The lowest 5-star budget a room may be created with: every 0.5 stars down is 150M less, so this keeps even a
 *  half-star club at 150M or more. Nobody types a budget any more; a room always gets FIVE_STAR_BUDGET. */
export const MIN_FIVE_STAR_BUDGET = FIVE_STAR_BUDGET;

/** Every club's budget comes from its real-world FC26 star rating (see clubStars.ts) whenever
 *  a roster is uploaded, scaled from the budget the host typed: that is what a 5-star club gets and
 *  each half star below is 150M less. A club the ratings file has never heard of gets the typed
 *  budget itself instead of a guess. */
function budgetsFromRoster(seed: SeedPlayer[], fiveStarBudget: number): Record<string, number> {
  const clubNameById = new Map<string, string>();
  for (const p of seed) if (p.clubId && !clubNameById.has(p.clubId)) clubNameById.set(p.clubId, p.club);
  const budgets: Record<string, number> = {};
  for (const [clubId, clubName] of clubNameById) {
    const stars = starsFor(clubName);
    budgets[clubId] = stars !== null ? budgetForStars(stars, fiveStarBudget) : fiveStarBudget;
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

  async create(opts: { totalBudget?: number; quoteTimerMs?: number; squadSizeCap?: number | null; capacity?: number; rosterCsv?: string; testMode?: boolean }): Promise<{ code: string }> {
    // An uploaded roster replaces the built-in 5-club seed entirely, so a room can be any real
    // club(s) in the FC26 database — every player in it has already been cross-checked.
    // No built-in teams: a room's clubs come only from the roster the host uploads.
    if (!opts.rosterCsv && this.seed.length === 0) throw new Error("upload a roster CSV to create a room");
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

    // Season 1 budgets come from star ratings, scaled from the fixed 5-star budget. From season 2 they come from
    // the standings and the money each club had left (below).
    const totalBudget = opts.totalBudget ?? FIVE_STAR_BUDGET;
    if (!tournament?.finishingOrder.length && !(totalBudget >= MIN_FIVE_STAR_BUDGET)) {
      throw new Error(`budget too low: a 5-star club needs at least ${MIN_FIVE_STAR_BUDGET}M`);
    }

    const max = this.maxCapacity(seed);
    if (opts.capacity !== undefined && (opts.capacity < 2 || opts.capacity > max)) {
      throw new Error(`capacity must be between 2 and ${max}`);
    }

    // Season 2+: a club's budget is its squad's value plus the money it had left last season plus STANDING_BONUS
    // for every league place it finished above last, so its spendable money at the start is exactly
    // leftover + bonus (worst-first order: index 0 is last place and gets no bonus).
    const clubBudgets: Record<string, number> = tournament?.finishingOrder.length
      ? Object.fromEntries(tournament.finishingOrder.map((clubId, i) =>
          [clubId, squadValue(seed, clubId) + (tournament!.leftovers[clubId] ?? 0) + STANDING_BONUS * i]))
      : opts.rosterCsv
        ? budgetsFromRoster(seed, totalBudget)
        : {};
    // A squad worth more than its club's budget is fine: that manager starts in the red and has to release
    // players (their choice) before the auction can end. See managersOverBudget in @fcdn/shared.

    const code = this.gen();
    let s = createRoom({
      code, totalBudget, seed, quoteTimerMs: opts.quoteTimerMs, squadSizeCap: opts.squadSizeCap,
      capacity: opts.capacity ?? max, seasonNumber: tournament?.seasonNumber, clubBudgets, testMode: opts.testMode === true,
      tournamentName: tournament?.tournamentName,
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
      if (s.status !== "setup") throw new Error("draft already started");
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
    const { state } = await this.q.run(code, (s) => {
      if (!s) throw new Error("no such room");
      // The season export is a roster file (## TEAMS with a place per club); older exports had a managers table.
      const finishingOrder = /^##\s*TEAMS/im.test(csv)
        ? parseTeamsFinishingOrder(csv, (club) => Object.values(s.managers).find(m =>
            normalizeForMatch(s.clubNames[m.clubId] ?? m.clubId) === normalizeForMatch(club) || m.clubId === slugifyClub(club))?.id)
        : parseFinishingOrder(csv);
      return { state: startNextSeason(s, { finishingOrder, ...opts }), events: [] };
    });
    this.db.save(state);
    return state;
  }

  loadFrom(db: Db) { for (const s of db.loadAll()) this.q.setState(s.code, s); }
}
