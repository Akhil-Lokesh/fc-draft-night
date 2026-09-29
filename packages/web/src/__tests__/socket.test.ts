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

test("forfeit() emits a forfeit intent carrying the room code and contestId", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().forfeit("c1");
  expect(t.emitted.at(-1)).toMatchObject({ ev: "forfeit", p: { code: "AB", contestId: "c1" } });
});

test("endDraft() emits an endDraft intent carrying the room code", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().endDraft();
  expect(t.emitted.at(-1)).toMatchObject({ ev: "endDraft", p: { code: "AB" } });
});

test("leave() clears the joined room so the app can return to the landing screen", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("joined", { managerId: "m_city" });
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().leave();
  expect(store.getState().room).toBeNull();
  expect(store.getState().managerId).toBeNull();
});

test("leave() stops a later reconnect from silently rejoining the old room", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("joined", { managerId: "m_city" });
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().leave();
  t.emitted.length = 0; // clear the log, only care about what happens after reconnect
  t.fire("connect", undefined);
  expect(t.emitted.find(e => e.ev === "join")).toBeUndefined();
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

test("peekRoom emits a peek and stores the server's roomPeek reply", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().peekRoom("AB");
  expect(t.emitted.at(-1)).toMatchObject({ ev: "peekRoom", p: { code: "AB" } });
  const peek = { code: "AB", found: true, capacity: 3, takenClubs: ["real"], managerCount: 1, allClubs: [{ id: "real", label: "Real Madrid" }] };
  t.fire("roomPeek", peek);
  expect(store.getState().roomPeek).toEqual(peek);
});

test("peeking a code that doesn't exist neither raises an error nor forgets this device's seat", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "AB", displayName: "A", clubId: "city" });
  t.fire("joined", { managerId: "m_city", seatKey: "seat-key-seat-key-seat" });

  store.getState().peekRoom("X");
  t.fire("roomPeek", { code: "X", found: false });
  expect(store.getState().error).toBeNull();
  expect(store.getState().roomPeek).toEqual({ code: "X", found: false });

  t.fire("connect", undefined); // a reconnect must still rejoin the seat this device holds
  expect(t.emitted.at(-1)).toMatchObject({ ev: "join", p: { code: "AB", seatKey: "seat-key-seat-key-seat" } });
});

test("a peek reply for a code the player has since typed past is ignored", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().peekRoom("AB");
  t.fire("roomPeek", { code: "AB", found: true, capacity: 2, takenClubs: [], managerCount: 0, allClubs: [] });
  store.getState().peekRoom("ABC");
  expect(store.getState().roomPeek).toBeNull(); // the old room's clubs don't linger under a new code
  t.fire("roomPeek", { code: "AB", found: true, capacity: 2, takenClubs: [], managerCount: 0, allClubs: [] });
  expect(store.getState().roomPeek).toBeNull();
  t.fire("roomPeek", { code: "ABC", found: false });
  expect(store.getState().roomPeek).toEqual({ code: "ABC", found: false });
});

test("after leave(), stray state broadcasts from the old room are ignored and the server is told", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "R0001", displayName: "Ana", clubId: "real" });
  t.fire("joined", { managerId: "m_real" });
  t.fire("state", { code: "R0001", managers: {}, players: {}, contests: {} });

  store.getState().leave();
  expect(t.emitted.at(-1)).toMatchObject({ ev: "leave", p: { code: "R0001" } });

  // The old room keeps broadcasting to this socket for a moment — it must not come back.
  t.fire("state", { code: "R0001", managers: {}, players: {}, contests: {} });
  expect(store.getState().room).toBeNull();

  // Creating a new room still works: its code arrives and its state is accepted once joined.
  t.fire("created", { code: "R0002" });
  expect(store.getState().createdCode).toBe("R0002");
  store.getState().join({ code: "R0002", displayName: "Ana", clubId: "real" });
  t.fire("state", { code: "R0002", managers: {}, players: {}, contests: {} });
  expect(store.getState().room?.code).toBe("R0002");
});

test("rejoining the room you left accepts its state again", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "R0001", displayName: "Ana", clubId: "real" });
  t.fire("state", { code: "R0001", managers: {}, players: {}, contests: {} });
  store.getState().leave();
  store.getState().join({ code: "R0001", displayName: "Ana", clubId: "real" });
  t.fire("state", { code: "R0001", managers: {}, players: {}, contests: {} });
  expect(store.getState().room?.code).toBe("R0001");
});

test("the seat key from the server is kept and sent on reconnect, so a refresh reclaims the same seat", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "AB", displayName: "A", clubId: "city" });
  t.fire("joined", { managerId: "m_city", seatKey: "secret-key" });
  t.fire("connect", undefined);
  expect(t.emitted.at(-1)).toMatchObject({ ev: "join", p: { code: "AB", seatKey: "secret-key" } });
});

test("leaving a room forgets its seat key", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  store.getState().join({ code: "AB", displayName: "A", clubId: "city" });
  t.fire("joined", { managerId: "m_city", seatKey: "secret-key" });
  store.getState().leave();
  const before = t.emitted.length;
  t.fire("connect", undefined);
  expect(t.emitted.slice(before).some((e) => JSON.stringify(e.p ?? "").includes("secret-key"))).toBe(false);
});

test("the host key from create rides along on that room's join, and only that one", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("created", { code: "AB", hostKey: "host-secret" });
  store.getState().join({ code: "AB", displayName: "A", clubId: "city" });
  expect(t.emitted.at(-1)).toMatchObject({ ev: "join", p: { code: "AB", hostKey: "host-secret" } });
  store.getState().join({ code: "ZZ", displayName: "A", clubId: "city" });
  expect(t.emitted.at(-1)!.p.hostKey).toBeUndefined();
});
