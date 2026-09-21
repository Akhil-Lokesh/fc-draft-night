import { test, expect } from "vitest";
import { makeStore } from "../state/socket.js";

function fakeTransport() {
  const handlers: Record<string, (p: any) => void> = {};
  const emitted: { ev: string; p: any }[] = [];
  return {
    emit: (ev: string, p: any) => { emitted.push({ ev, p }); },
    on: (ev: string, h: (p: any) => void) => { handlers[ev] = h; },
    fire: (ev: string, p: any) => handlers[ev]?.(p),
    emitted,
  };
}

test("records managerId on joined and applies a state broadcast", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("joined", { managerId: "m_city" });
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  expect(store.getState().managerId).toBe("m_city");
  expect(store.getState().room?.code).toBe("AB");
});

test("bid() emits a bid intent carrying the room code", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().bid("c1", 200);
  expect(t.emitted.at(-1)).toMatchObject({ ev: "bid", p: { code: "AB", contestId: "c1", amount: 200 } });
});

test("challenge() emits playerId + amount for a rival-owned player", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().challenge("mbappe", 210);
  expect(t.emitted.at(-1)).toMatchObject({ ev: "challenge", p: { code: "AB", playerId: "mbappe", amount: 210 } });
});

test("create() emits create and captures the code the server returns", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().create({ totalBudget: 600 });
  expect(t.emitted.at(-1)).toMatchObject({ ev: "create", p: { totalBudget: 600 } });
  t.fire("created", { code: "R0001" });
  expect(store.getState().createdCode).toBe("R0001");
});

test("catalog results from the server are stored for the pool builder", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("catalogResults", [{ id: "l1", name: "F. Wirtz" }]);
  expect(store.getState().catalogResults).toHaveLength(1);
});

test("re-emits join on (re)connect so a dropped socket rejoins its room", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "AB", displayName: "A", clubId: "city" });
  t.fire("joined", { managerId: "m_city" });
  t.fire("connect", undefined); // socket.io fires this on every (re)connection
  const last = t.emitted.at(-1);
  expect(last?.ev).toBe("join");
  expect(last?.p).toMatchObject({ code: "AB", clubId: "city", managerId: "m_city" });
});
