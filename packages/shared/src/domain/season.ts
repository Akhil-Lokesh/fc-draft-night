import type { RoomState } from "./types.js";
import { coverDeficit } from "./resolution.js";

/** finishingOrder is worst-first; each step up the table adds `step`. */
export function positionStepBudgets(finishingOrder: string[], base: number, step: number): Record<string, number> {
  const out: Record<string, number> = {};
  finishingOrder.forEach((id, i) => { out[id] = base + i * step; });
  return out;
}

export function releaseToOriginal(s: RoomState, ownerId: string, playerId: string): RoomState {
  const p = s.players[playerId];
  if (!p) throw new Error(`unknown player ${playerId}`);
  if (p.ownerId !== ownerId) return s;
  const m = s.managers[ownerId];
  if (!m) throw new Error(`unknown manager ${ownerId}`);
  return {
    ...s,
    managers: { ...s.managers, [ownerId]: { ...m, reserved: m.reserved - p.listedValue } },
    players: { ...s.players, [playerId]: { ...p, ownerId: null, listedValue: p.originalValue, lockedThisSeason: false } },
  };
}

export function startNextSeason(
  s: RoomState, a: { finishingOrder: string[]; base: number; step: number },
): RoomState {
  const bases = positionStepBudgets(a.finishingOrder, a.base, a.step);
  const managers = { ...s.managers };
  const players = Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, { ...p, lockedThisSeason: false }]));
  let state: RoomState = {
    ...s, players, contests: {}, challenges: {}, log: [],
    seasonNumber: s.seasonNumber + 1, status: "setup", startedAt: null, totalBudget: a.base,
  };
  for (const id of Object.keys(managers)) {
    const manager = managers[id];
    if (!manager) throw new Error(`unknown manager ${id}`);
    const leftover = manager.spendable;
    const reserved = Object.values(players).filter(p => p.ownerId === id).reduce((sum, p) => sum + p.listedValue, 0);
    const newBase = bases[id] ?? a.base;
    managers[id] = { ...manager, reserved, spendable: newBase + Math.max(0, leftover) - reserved };
  }
  state = { ...state, managers };
  // reserved-overflow unwind (§4.9): any manager left negative releases players + fine handled by coverDeficit
  for (const id of Object.keys(managers)) {
    const mgr = state.managers[id];
    if (mgr && mgr.spendable < 0) state = coverDeficit(state, id, 0);
  }
  return state;
}
