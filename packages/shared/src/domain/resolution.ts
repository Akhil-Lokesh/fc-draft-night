import type { RoomState, Contest } from "./types.js";
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
  log.push({ t: "win", at: now, contestId: c.id, managerId: winnerId, playerId: c.playerId, price });
  return { ...s, managers, players, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } }, log };
}

/** Finalize one closed war to its top bid, with the affordability + void/fine unwind. */
export function finalizeContest(s: RoomState, contestId: string, now: number): RoomState {
  const c = s.contests[contestId];
  if (!c || (c.status !== "war" && c.status !== "listing")) return s;
  const top = c.quotes.at(-1);
  if (!top) { // no bids: close untouched
    return repairAll({ ...s, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } } }, now);
  }
  const winner = s.managers[top.managerId];
  if (!winner) throw new Error(`unknown manager ${top.managerId}`);
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const spent = cost(player, top.managerId, top.amount);
  if (spent <= winner.spendable) return repairAll(applyWin(s, c, top.managerId, top.amount, now), now);

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
    return repairAll(applyWin({ ...voided, contests: { ...voided.contests, [c.id]: { ...c, status: "war" } } }, c, ru.managerId, ru.amount, now), now);
  }
  // else player stays with prev owner (already true) or pool; nothing to transfer.
  return repairAll(voided, now);
}

/** Resolve every due contest in close order. */
export function resolveDue(s: RoomState, now: number): RoomState {
  let state = s;
  for (const c of dueContests(state, now)) state = finalizeContest(state, c.id, now);
  return state;
}

/** Release the manager's own players (cheapest listed value first) until spendable >= 0. */
export function coverDeficit(s: RoomState, managerId: string, now: number): RoomState {
  let state = s;
  const owned = () => Object.values(state.players)
    .filter(p => p.ownerId === managerId)
    .sort((a, b) => a.listedValue - b.listedValue);
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

/** Repair every manager left with a negative balance (e.g. from the overcommit fine). */
function repairAll(s: RoomState, now: number): RoomState {
  let state = s;
  for (const id of Object.keys(state.managers)) {
    const m = state.managers[id];
    if (m && m.spendable < 0) state = coverDeficit(state, id, now);
  }
  return state;
}
