import type { RoomState, Contest, Manager } from "./types.js";
import { OVERCOMMIT_FINE } from "./types.js";
import { cost } from "./budget.js";
import { dueContests } from "./close.js";

/** Highest standing bidder other than `exclude`, for the runner-up path. */
function runnerUp(c: Contest, exclude: string): { managerId: string; amount: number } | null {
  const best = new Map<string, number>();
  for (const q of c.quotes) if (q.managerId !== exclude) best.set(q.managerId, Math.max(best.get(q.managerId) ?? 0, q.amount));
  let top: { managerId: string; amount: number } | null = null;
  for (const [managerId, amount] of best) if (!top || amount > top.amount) top = { managerId, amount };
  return top;
}

function applyWin(s: RoomState, c: Contest, winnerId: string, price: number, now: number): RoomState {
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const managers = { ...s.managers };
  const players = { ...s.players };
  const log = [...s.log];
  const prevOwner = player.ownerId;
  const buyer = managers[winnerId];
  if (!buyer) throw new Error(`unknown manager ${winnerId}`);
  const spent = cost(player, winnerId, price);
  managers[winnerId] = { ...buyer, spendable: buyer.spendable - spent };
  if (prevOwner && prevOwner !== winnerId) {
    const seller = managers[prevOwner];
    if (!seller) throw new Error(`unknown manager ${prevOwner}`);
    managers[prevOwner] = { ...seller, reserved: seller.reserved - player.listedValue, spendable: seller.spendable + player.listedValue };
  }
  // winner now reserves the player at the new (transfer) listed value
  const newValue = price;
  const winnerAfterSale = managers[winnerId];
  if (!winnerAfterSale) throw new Error(`unknown manager ${winnerId}`);
  managers[winnerId] = { ...winnerAfterSale, reserved: winnerAfterSale.reserved + (prevOwner === winnerId ? (newValue - player.listedValue) : newValue) };
  players[c.playerId] = { ...player, ownerId: winnerId, listedValue: newValue, lockedThisSeason: true };
  // A release-listing nobody ever quoted on but the lister's own opening one (quotes.length===1)
  // reverts to them with zero net cost (cost() above is 0) — log it as "unsold", not "win", so it
  // doesn't read as a fresh purchase in the feed or inflate spend/recap totals. A release that
  // DID draw a rival bid and the original owner won back by outbidding them (quotes.length > 1)
  // is a real, paid-for defense — still a genuine "win".
  const unsold = c.type === "release-listing" && c.quotes.length === 1;
  log.push({ t: unsold ? "unsold" : "win", at: now, contestId: c.id, managerId: winnerId, playerId: c.playerId, price });
  return { ...s, managers, players, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } }, log };
}

/** Finalize one closed war to its top bid, with the affordability + void/fine unwind. */
export function finalizeContest(s: RoomState, contestId: string, now: number): RoomState {
  const c = s.contests[contestId];
  if (!c || (c.status !== "war" && c.status !== "listing")) return s;
  const top = c.quotes.at(-1);
  if (!top) { // no bids: close untouched
    return { ...s, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } } };
  }
  const winner = s.managers[top.managerId];
  if (!winner) throw new Error(`unknown manager ${top.managerId}`);
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const spent = cost(player, top.managerId, top.amount);
  if (spent <= winner.spendable) return applyWin(s, c, top.managerId, top.amount, now);

  // Cannot afford -> void, fine, cascade to runner-up / prev owner / pool.
  const voided: RoomState = {
    ...s,
    contests: { ...s.contests, [c.id]: { ...c, status: "voided" } },
    managers: { ...s.managers, [top.managerId]: { ...winner, spendable: winner.spendable - OVERCOMMIT_FINE } },
    log: [...s.log,
      { t: "void", at: now, contestId: c.id, managerId: top.managerId, reason: "overcommit" },
      { t: "fine", at: now, managerId: top.managerId, amount: OVERCOMMIT_FINE }],
  };
  const ru = runnerUp(c, top.managerId);
  const runnerUpManager = ru ? voided.managers[ru.managerId] : undefined;
  if (ru && runnerUpManager && cost(player, ru.managerId, ru.amount) <= runnerUpManager.spendable) {
    return applyWin({ ...voided, contests: { ...voided.contests, [c.id]: { ...c, status: "war" } } }, c, ru.managerId, ru.amount, now);
  }
  // else player stays with prev owner (already true) or pool; nothing to transfer.
  return voided;
}

/** Managers whose balance is below zero: their squad is worth more than their budget (a club that
 *  started over budget, or one fined for overcommitting). Exactly zero is fine. */
export function managersOverBudget(s: RoomState): Manager[] {
  return Object.values(s.managers).filter((m) => m.spendable < 0);
}

/** Resolve every due contest in close order. Once the overall draft clock has elapsed AND nothing is
 *  left open (an active war still runs out its own anti-snipe timer first) AND nobody is over budget,
 *  the room closes on its own — the host button is only for ending things early.
 *
 *  Nobody's players are released for them: a manager in the red releases players themselves, and the
 *  auction simply doesn't end (clock or no clock) until every balance is zero or better. */
export function resolveDue(s: RoomState, now: number): RoomState {
  let state = s;
  for (const c of dueContests(state, now)) state = finalizeContest(state, c.id, now);
  const clockElapsed = state.status === "live" && state.startedAt !== null && now >= state.startedAt + state.draftClockMs;
  const nothingOpen = Object.values(state.contests).every(c => c.status !== "war" && c.status !== "listing");
  if (clockElapsed && nothingOpen && managersOverBudget(state).length === 0) state = { ...state, status: "closed" };
  return state;
}

/** The host manually ending the draft: force-resolve every open contest right now regardless of
 *  its own closesAt (unlike the natural clock, which lets an active war run out its own timer),
 *  then close the room. Refused — with nothing changed — while anyone is below zero once those
 *  contests are settled. */
export function endDraftNow(s: RoomState, now: number): RoomState {
  let state = s;
  for (const c of Object.values(state.contests).filter(c => c.status === "war" || c.status === "listing")) {
    state = finalizeContest(state, c.id, now);
  }
  const red = managersOverBudget(state);
  if (red.length > 0) {
    const who = red.map((m) => `${state.clubNames[m.clubId] ?? m.clubId} (${m.displayName})`).join(", ");
    throw new Error(`can't end while ${who} ${red.length === 1 ? "is" : "are"} over budget — release players first`);
  }
  return { ...state, status: "closed" };
}

/** Release the manager's own players (cheapest listed value first) until spendable >= 0.
 *  Never releases a player who is currently the subject of an open (unresolved) contest —
 *  a forced release must never contend with that contest's own war mechanics.
 *  Only the season handoff uses this now (spec §4.9). Inside a draft nobody is released for
 *  anyone: see managersOverBudget / resolveDue. */
export function coverDeficit(s: RoomState, managerId: string, now: number): RoomState {
  let state = s;
  const contestedPlayerIds = () => new Set(
    Object.values(state.contests)
      .filter(c => c.status === "war" || c.status === "listing")
      .map(c => c.playerId),
  );
  const owned = () => {
    const contested = contestedPlayerIds();
    return Object.values(state.players)
      .filter(p => p.ownerId === managerId && !contested.has(p.id))
      .sort((a, b) => a.listedValue - b.listedValue);
  };
  for (;;) {
    const m = state.managers[managerId];
    if (!m) throw new Error(`unknown manager ${managerId}`);
    if (m.spendable >= 0) break;
    const p = owned()[0];
    if (!p) break; // nothing left to release
    state = {
      ...state,
      managers: { ...state.managers, [managerId]: { ...m, reserved: m.reserved - p.listedValue, spendable: m.spendable + p.listedValue } },
      players: { ...state.players, [p.id]: { ...p, ownerId: null } },
      log: [...state.log, { t: "release", at: now, managerId, playerId: p.id, toValue: p.listedValue }],
    };
  }
  return state;
}
