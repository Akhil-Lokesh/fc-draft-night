import { test, expect } from "vitest";
import { createRoom, addManager, hostOf, requestLeave, cancelLeave, resolveLeave } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

const lobby = () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "m_real", displayName: "Host", clubId: "real" });
  return addManager(s, { id: "m_city", displayName: "Guest", clubId: "city" });
};

test("the first manager in is the host", () => {
  expect(hostOf(lobby())).toBe("m_real");
});

test("a room saved before hosts were tracked treats its first manager as host", () => {
  const { hostId: _h, ...old } = lobby();
  expect(hostOf(old as any)).toBe("m_real");
});

test("a guest's leave request waits for the host; allowing it frees their seat and club", () => {
  let s = requestLeave(lobby(), "m_city");
  expect(s.leaveRequests).toEqual(["m_city"]);
  expect(s.managers.m_city).toBeTruthy(); // still in until the host answers
  s = resolveLeave(s, "m_real", "m_city", true);
  expect(s.managers.m_city).toBeUndefined();
  expect(s.leaveRequests).toEqual([]);
  expect(Object.values(s.players).some((p) => p.ownerId === "m_city")).toBe(false);
});

test("a declined request keeps the guest in the room", () => {
  const s = resolveLeave(requestLeave(lobby(), "m_city"), "m_real", "m_city", false);
  expect(s.managers.m_city).toBeTruthy();
  expect(s.leaveRequests).toEqual([]);
});

test("only the host can answer a leave request", () => {
  const s = requestLeave(lobby(), "m_city");
  expect(() => resolveLeave(s, "m_city", "m_city", true)).toThrow(/only the host/);
});

test("a guest can take back their request", () => {
  expect(cancelLeave(requestLeave(lobby(), "m_city"), "m_city").leaveRequests).toEqual([]);
});

test("nobody can ask to leave once the draft is live", () => {
  const live = { ...lobby(), status: "live" as const };
  expect(() => requestLeave(live, "m_city")).toThrow(/draft has started/);
});
