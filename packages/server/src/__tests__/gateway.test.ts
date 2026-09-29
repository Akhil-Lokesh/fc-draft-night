import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

test("a joined client receives a state broadcast, and a challenge propagates to a second client", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 }); // real FC26 dataset's budget floor
  const a = client(url), b = client(url);

  const bothJoined = new Promise<any>(res => b.on("state", res));
  // a joins first so a is the host (first manager in a room made without a host key).
  await new Promise<any>(res => a.once("joined", res).emit("join", { code: "TEST1", displayName: "A", clubId: "city" }));
  b.emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" });
  const afterJoin = await bothJoined;
  expect(afterJoin.code).toBe("TEST1");

  // Find a real player actually owned by Bayern in this room, to challenge — real data has no
  // pool players yet, so a challenge on a rival's owned player is what's testable here.
  const bayernManagerId = Object.values(afterJoin.managers as Record<string, any>)
    .find((m: any) => m.clubId === "bayern")!.id as string;
  const bayernPlayer = Object.values(afterJoin.players as Record<string, any>)
    .find((p: any) => p.ownerId === bayernManagerId) as any;
  expect(bayernPlayer).toBeTruthy();

  // Wait for the "start" broadcast to actually land before listening for the next one,
  // so the challenge's broadcast isn't raced by start's own (asynchronous) broadcast.
  const afterStart = new Promise<any>(res => b.on("state", (st: any) => { if (st.status === "live") res(st); }));
  a.emit("start", { code: "TEST1" });
  await afterStart;

  const stateOnB = new Promise<any>(res => b.on("state", (st: any) => {
    if (Object.values(st.contests as Record<string, any>).some((c: any) => c.playerId === bayernPlayer.id)) res(st);
  }));
  a.emit("challenge", { code: "TEST1", playerId: bayernPlayer.id, amount: bayernPlayer.listedValue + 1 });
  const s = await stateOnB;

  expect(s.code).toBe("TEST1");
  const contest = Object.values(s.contests as Record<string, any>).find((c: any) => c.playerId === bayernPlayer.id);
  expect(contest).toBeTruthy();
  expect((contest as any).status).toBe("war");

  a.close(); b.close(); io.close(); http.close();
});

test("the owner forfeiting a war over the socket resolves it immediately for everyone", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 });
  const a = client(url), b = client(url);

  const bothJoined = new Promise<any>(res => b.on("state", res));
  // a joins first so a is the host (first manager in a room made without a host key).
  await new Promise<any>(res => a.once("joined", res).emit("join", { code: "TEST1", displayName: "A", clubId: "city" }));
  b.emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" });
  const afterJoin = await bothJoined;

  const bayernManagerId = Object.values(afterJoin.managers as Record<string, any>)
    .find((m: any) => m.clubId === "bayern")!.id as string;
  const bayernPlayer = Object.values(afterJoin.players as Record<string, any>)
    .find((p: any) => p.ownerId === bayernManagerId) as any;

  const afterStart = new Promise<any>(res => b.on("state", (st: any) => { if (st.status === "live") res(st); }));
  a.emit("start", { code: "TEST1" });
  await afterStart;

  const warOpened = new Promise<any>(res => b.on("state", (st: any) =>
    Object.values(st.contests as Record<string, any>).some((c: any) => c.playerId === bayernPlayer.id) && res(st)));
  a.emit("challenge", { code: "TEST1", playerId: bayernPlayer.id, amount: bayernPlayer.listedValue + 1 });
  const opened = await warOpened;
  const contestId = Object.values(opened.contests as Record<string, any>).find((c: any) => c.playerId === bayernPlayer.id)!.id as string;

  const resolved = new Promise<any>(res => b.on("state", (st: any) => {
    const c = (st.contests as Record<string, any>)[contestId];
    if (c && c.status === "closed") res(st);
  }));
  b.emit("forfeit", { code: "TEST1", contestId });
  const s = await resolved;

  expect(s.players[bayernPlayer.id].ownerId).toBe("m_city");

  a.close(); b.close(); io.close(); http.close();
});

test("host ending the draft over the socket closes the room for everyone", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 });
  const a = client(url), b = client(url);

  const bothJoined = new Promise<any>(res => b.on("state", res));
  // a joins first so a is the host (first manager in a room made without a host key).
  await new Promise<any>(res => a.once("joined", res).emit("join", { code: "TEST1", displayName: "A", clubId: "city" }));
  b.emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" });
  await bothJoined;

  const afterStart = new Promise<any>(res => b.on("state", (st: any) => { if (st.status === "live") res(st); }));
  a.emit("start", { code: "TEST1" });
  await afterStart;

  const afterEnd = new Promise<any>(res => b.on("state", (st: any) => { if (st.status === "closed") res(st); }));
  a.emit("endDraft", { code: "TEST1" });
  const s = await afterEnd;

  expect(s.status).toBe("closed");

  a.close(); b.close(); io.close(); http.close();
});

/**
 * Regression: a room persisted under an older RoomState shape (missing `clubNames` — e.g. from
 * before that field existed) must never crash the whole server for every connected client.
 * `peekRoom` previously read `existing.clubNames` unguarded; one malformed room in the DB took
 * the entire process down on the next peek, not just that one request.
 */
test("peekRoom on a room missing clubNames (legacy/corrupt data) degrades gracefully, not a server crash", async () => {
  const { store, q, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 }); // a normal room, to prove the server is still alive after
  q.setState("LEGACY1", { code: "LEGACY1", capacity: 5, managers: {} } as any); // no clubNames at all

  const a = client(url);
  const peeked1 = new Promise<any>(res => a.once("roomPeek", res));
  a.emit("peekRoom", { code: "LEGACY1" });
  const peek1 = await peeked1; // must not hang/crash — a roomPeek event proves the handler survived
  expect(peek1.allClubs).toEqual([]);

  // server is still up and functional for other rooms
  const peeked2 = new Promise<any>(res => a.once("roomPeek", res));
  a.emit("peekRoom", { code: "TEST1" });
  const peek2 = await peeked2;
  expect(peek2.capacity).toBeGreaterThan(0);

  a.close(); io.close(); http.close();
});

test("peeking a code with no room answers 'not found' for that code, never an error", async () => {
  const { store, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 });
  const a = client(url);
  const errors: string[] = [];
  a.on("error", (m: string) => errors.push(m));

  const missing = new Promise<any>(res => a.once("roomPeek", res));
  a.emit("peekRoom", { code: "TES" }); // a half-typed code
  expect(await missing).toEqual({ code: "TES", found: false });

  const found = new Promise<any>(res => a.once("roomPeek", res));
  a.emit("peekRoom", { code: "TEST1" }); // replies arrive in order, so this one follows any error too
  expect(await found).toMatchObject({ code: "TEST1", found: true });
  expect(errors).toEqual([]);
  a.close(); io.close(); http.close();
});

test("a client can create a room over the socket and receives its code", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  const created = new Promise<any>(res => a.on("created", res));
  a.emit("create", { totalBudget: 1500 });
  const { code } = await created;

  expect(code).toBe("TEST1");

  a.close(); io.close(); http.close();
});

test("creating a room below the budget floor returns a clear error", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  const err = new Promise<string>(res => a.once("error", res));
  a.emit("create", { totalBudget: 100 });
  const message = await err;

  expect(message).toMatch(/budget too low/i);

  a.close(); io.close(); http.close();
});

/**
 * Bug 4 (LOW — robustness): commands sent before `join` completes must be rejected with a
 * clear, user-facing error — not throw an unguarded internal TypeError (e.g. from reading
 * `joined!.managerId` when `joined` is still null).
 */
test("a command sent before join completes returns a clear error, not a raw internal error", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));

  const a = client(url);
  const err = new Promise<string>(res => a.once("error", res));
  a.emit("bid", { code: "TEST1", contestId: "c1", amount: 100 });
  const message = await err;

  expect(message).toMatch(/join/i);
  expect(message).not.toMatch(/cannot read propert/i);

  a.close(); io.close(); http.close();
});

test("a client that leaves a room stops receiving that room's broadcasts", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 });
  const a = client(url), b = client(url);

  // b joins first so b is the host and can start the draft after a walks out.
  await new Promise<any>(res => b.once("joined", res).emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" }));
  const bothJoined = new Promise<any>(res => b.on("state", (st: any) => { if (Object.keys(st.managers).length === 2) res(st); }));
  a.emit("join", { code: "TEST1", displayName: "A", clubId: "city" });
  await bothJoined;
  await new Promise(r => setTimeout(r, 50)); // let a's own join broadcasts drain

  let aGotState = false;
  a.on("state", () => { aGotState = true; });
  a.emit("leave", { code: "TEST1" });
  await new Promise(r => setTimeout(r, 50));

  const bSawStart = new Promise<any>(res => b.on("state", (st: any) => { if (st.status === "live") res(st); }));
  b.emit("start", { code: "TEST1" });
  await bSawStart;
  await new Promise(r => setTimeout(r, 50));
  expect(aGotState).toBe(false);

  a.close(); b.close(); io.close(); http.close();
});

test("releasing your own player over the socket is instant — no contest appears, ownership/budget update in the same broadcast", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 });
  const a = client(url), b = client(url);

  const joined = new Promise<any>(res => a.on("state", res));
  a.emit("join", { code: "TEST1", displayName: "A", clubId: "city" });
  const afterJoin = await joined;
  const managerId = Object.values(afterJoin.managers as Record<string, any>)[0]!.id as string;
  const mine = Object.values(afterJoin.players as Record<string, any>).find((p: any) => p.ownerId === managerId) as any;
  expect(mine).toBeTruthy();
  const before = afterJoin.managers[managerId];

  // Releasing belongs to a live draft: a second manager fills the room, then the host starts it.
  await new Promise<any>(res => b.once("joined", res).emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" }));
  const live = new Promise<void>(res => a.on("state", (st: any) => { if (st.status === "live") res(); }));
  a.emit("start", { code: "TEST1" });
  await live;

  const afterRelease = new Promise<any>(res => a.on("state", (st: any) => {
    if (st.players[mine.id]?.ownerId === null) res(st);
  }));
  a.emit("openListing", { code: "TEST1", playerId: mine.id });
  const s = await afterRelease;

  // No listing contest ever appears — not even momentarily — for the released player.
  expect(Object.values(s.contests as Record<string, any>).some((c: any) => c.playerId === mine.id)).toBe(false);
  expect(s.players[mine.id].ownerId).toBeNull();
  const after = s.managers[managerId];
  expect(after.reserved).toBe(before.reserved - mine.listedValue);
  expect(after.spendable).toBe(before.spendable + mine.listedValue);

  a.close(); b.close(); io.close(); http.close();
});

test("a guest leaving the lobby needs the host's approval, and approval frees their club", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 });
  const host = client(url), guest = client(url);
  const joined = (c: ReturnType<typeof client>) => new Promise<void>(res => c.once("joined", () => res()));

  host.emit("join", { code: "TEST1", displayName: "H", clubId: "city" });
  await joined(host);
  guest.emit("join", { code: "TEST1", displayName: "G", clubId: "bayern" });
  await joined(guest);

  const guestError = new Promise<string>(res => guest.once("error", res));
  const pending = new Promise<any>(res => host.on("state", (st: any) => { if (st.leaveRequests?.includes("m_bayern")) res(st); }));
  guest.emit("requestLeave", { code: "TEST1" });
  expect((await pending).managers.m_bayern).toBeTruthy(); // asked, not gone yet

  guest.emit("resolveLeave", { code: "TEST1", managerId: "m_bayern", allow: true }); // can't approve yourself
  expect(await guestError).toMatch(/only the host/);

  const gone = new Promise<any>(res => guest.on("state", (st: any) => { if (!st.managers.m_bayern) res(st); }));
  host.emit("resolveLeave", { code: "TEST1", managerId: "m_bayern", allow: true });
  const after = await gone;
  expect(after.hostId).toBe("m_city");
  expect(Object.values(after.players as Record<string, any>).some((p: any) => p.ownerId === "m_bayern")).toBe(false);

  host.close(); guest.close(); io.close(); http.close();
});
