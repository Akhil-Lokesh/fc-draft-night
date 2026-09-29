import { test, expect } from "vitest";
import { createRoom, addManager, type RoomState } from "../domain/types.js";
import { applyCommand, type Command } from "../domain/engine.js";
import { fixtureSeed } from "./fixtures/roster.js";

function lobby(): RoomState {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed(), capacity: 2 });
  s = addManager(s, { id: "m_real", displayName: "Ana", clubId: "real" });
  s = addManager(s, { id: "m_barca", displayName: "Bo", clubId: "barca" });
  return s;
}
const ownedBy = (s: RoomState, id: string) => Object.values(s.players).find(p => p.ownerId === id)!;
const started = (s: RoomState) => applyCommand(s, { type: "StartDraft", now: 0 }).state;

test("no auction command works before the draft has started", () => {
  const s = lobby();
  const commands: Command[] = [
    { type: "OpenListing", managerId: "m_real", playerId: ownedBy(s, "m_real").id, now: 1 },
    { type: "Challenge", managerId: "m_real", playerId: ownedBy(s, "m_barca").id, amount: 999, now: 1 },
    { type: "PlaceBid", contestId: "any", managerId: "m_real", amount: 999, now: 1 },
    { type: "Forfeit", contestId: "any", managerId: "m_real", now: 1 },
  ];
  for (const c of commands) expect(() => applyCommand(s, c), c.type).toThrow(/hasn't started/i);
  expect(Object.keys(s.contests)).toHaveLength(0);
});

test("ending a draft that never started is rejected", () => {
  expect(() => applyCommand(lobby(), { type: "EndDraft", now: 1 })).toThrow(/hasn't started/i);
});

test("a live draft can't be started again, which would reset its clock", () => {
  const live = started(lobby());
  expect(() => applyCommand(live, { type: "StartDraft", now: 5000 })).toThrow(/already started/i);
  expect(live.startedAt).toBe(0);
});

test("once the draft is over no auction command works and it can't be reopened", () => {
  const over = applyCommand(started(lobby()), { type: "EndDraft", now: 10 }).state;
  expect(over.status).toBe("closed");
  expect(() => applyCommand(over, { type: "OpenListing", managerId: "m_real", playerId: ownedBy(over, "m_real").id, now: 11 })).toThrow(/is over/i);
  expect(() => applyCommand(over, { type: "StartDraft", now: 12 })).toThrow(/is over/i);
});

test("a live draft still runs: a manager can release their own player, instantly", () => {
  const live = started(lobby());
  const id = ownedBy(live, "m_real").id;
  const { state } = applyCommand(live, { type: "OpenListing", managerId: "m_real", playerId: id, now: 1 });
  expect(state.players[id]!.ownerId).toBeNull(); // back in the pool, no contest needed
});
