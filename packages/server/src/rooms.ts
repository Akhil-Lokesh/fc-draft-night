import { createRoom, addManager, budgetFloor, startNextSeason, type RoomState, type SeedPlayer } from "@fcdn/shared";
import type { Queue } from "./queue.js";
import type { Db } from "./db.js";
import { parseFinishingOrder } from "./import.js";

let counter = 0;
function defaultCode(): string {
  counter++;
  return "R" + counter.toString(36).toUpperCase().padStart(4, "0");
}

export class RoomStore {
  constructor(private q: Queue<RoomState>, private db: Db, private seed: SeedPlayer[], private gen: () => string = defaultCode) {}

  get(code: string) { return this.q.getState(code); }

  async create(opts: { totalBudget: number; quoteTimerMs?: number; squadSizeCap?: number | null }): Promise<{ code: string }> {
    const floor = budgetFloor(this.seed);
    if (opts.totalBudget < floor) throw new Error(`budget below floor (${floor})`);
    const code = this.gen();
    const s = createRoom({ code, totalBudget: opts.totalBudget, seed: this.seed, quoteTimerMs: opts.quoteTimerMs, squadSizeCap: opts.squadSizeCap });
    this.q.setState(code, s);
    this.db.save(s);
    return { code };
  }

  async join(code: string, m: { displayName: string; clubId: string }): Promise<{ managerId: string }> {
    const managerId = `m_${m.clubId}`;
    const { state } = await this.q.run(code, (s) => {
      if (!s) throw new Error("no such room");
      if (Object.values(s.managers).some(x => x.clubId === m.clubId)) throw new Error("club taken");
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
