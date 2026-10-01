import { test, expect } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

const joinAs = (c: Socket, p: Record<string, unknown>) =>
  new Promise<any>((res, rej) => { c.once("joined", res); c.once("error", rej); c.emit("join", { code: "TEST1", ...p }); });
const nextError = (c: Socket) => new Promise<string>((res) => c.once("error", res));
const nextState = (c: Socket, ok: (st: any) => boolean) => new Promise<any>((res) => c.on("state", (st: any) => { if (ok(st)) res(st); }));

async function room(opts: { capacity: number; testMode?: boolean }) {
  const env = await boot(new Db(":memory:"), new FakeClock(0));
  await env.store.create({ totalBudget: 1500, capacity: opts.capacity, ...(opts.testMode ? { testMode: true } : {}) });
  return env;
}
/** A free agent: nobody owns him, and his home club isn't one of the managers'. */
const poolPlayer = (st: any) =>
  Object.values(st.players as Record<string, any>).find((p: any) => p.ownerId === null)!;
const close = (env: any, ...socks: Socket[]) => { socks.forEach((s) => s.close()); env.io.close(); env.http.close(); };

test("a room created with testMode is a test room; any other room is not", async () => {
  const env = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(env.url);
  const made = (payload: Record<string, unknown>) => new Promise<any>((res) => { a.once("created", res); a.emit("create", payload); });
  const t = await made({ totalBudget: 1500, testMode: true });
  expect(env.store.get(t.code)!.testMode).toBe(true);
  const n = await made({ totalBudget: 1500 });
  expect(env.store.get(n.code)!.testMode).toBeFalsy();
  close(env, a);
});

test("the host of a test room can start alone: empty seats become practice managers", async () => {
  const env = await room({ capacity: 3, testMode: true });
  const host = client(env.url);
  const { managerId } = await joinAs(host, { displayName: "Me", clubId: "city" });

  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st = await live;

  const managers = Object.values(st.managers as Record<string, any>);
  expect(managers).toHaveLength(3);
  const practice = managers.filter((m: any) => m.practice);
  expect(practice).toHaveLength(2);
  expect(managers.find((m: any) => m.id === managerId).practice).toBeFalsy(); // the real player is not a practice seat
  expect(new Set(managers.map((m: any) => m.clubId)).size).toBe(3); // each seat is a different club
  expect(practice.every((m: any) => /^Practice \d$/.test(m.displayName))).toBe(true);
  // nobody can join a practice seat later: each has a seat key nobody was given
  const keys = env.store.get("TEST1")!.seatKeys!;
  expect(practice.every((m: any) => typeof keys[m.id] === "string")).toBe(true);
  close(env, host);
});

test("an ordinary room still won't start until every seat is taken", async () => {
  const env = await room({ capacity: 3 });
  const host = client(env.url);
  await joinAs(host, { displayName: "Me", clubId: "city" });
  const err = nextError(host);
  host.emit("start", { code: "TEST1" });
  expect(await err).toMatch(/waiting for 2 more/i);
  expect(env.store.get("TEST1")!.status).toBe("setup");
  close(env, host);
});

test("in a test room the host can bid as a practice manager", async () => {
  const env = await room({ capacity: 2, testMode: true });
  const host = client(env.url);
  const { managerId } = await joinAs(host, { displayName: "Me", clubId: "city" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  const practiceId = (Object.values(st0.managers as Record<string, any>).find((m: any) => m.practice) as any).id;
  const p = poolPlayer(st0) as any;

  const opened = nextState(host, (st) => Object.values(st.contests as Record<string, any>).some((c: any) => c.playerId === p.id));
  host.emit("openListing", { code: "TEST1", playerId: p.id });
  const c = Object.values((await opened).contests as Record<string, any>).find((x: any) => x.playerId === p.id) as any;
  expect(c.quotes.at(-1).managerId).toBe(managerId);

  const outbid = nextState(host, (st) => (st.contests[c.id]?.quotes.length ?? 0) === 2);
  host.emit("bid", { code: "TEST1", contestId: c.id, amount: p.listedValue + 1, as: practiceId });
  const after = await outbid;
  expect(after.contests[c.id].quotes.at(-1).managerId).toBe(practiceId); // the bid came from the practice seat
  close(env, host);
});

test("in a test room the host can release a practice manager's own player", async () => {
  const env = await room({ capacity: 2, testMode: true });
  const host = client(env.url);
  await joinAs(host, { displayName: "Me", clubId: "city" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  const practiceId = (Object.values(st0.managers as Record<string, any>).find((m: any) => m.practice) as any).id;
  const theirs = Object.values(st0.players as Record<string, any>).find((p: any) => p.ownerId === practiceId) as any;

  const freed = nextState(host, (st) => st.players[theirs.id]?.ownerId === null);
  host.emit("openListing", { code: "TEST1", playerId: theirs.id, as: practiceId });
  expect((await freed).players[theirs.id].ownerId).toBeNull();
  close(env, host);
});

test("acting as another seat is refused in an ordinary room", async () => {
  const env = await room({ capacity: 2 });
  const host = client(env.url), guest = client(env.url);
  await joinAs(host, { displayName: "H", clubId: "city" });
  const { managerId: guestId } = await joinAs(guest, { displayName: "G", clubId: "bayern" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  const p = poolPlayer(st0) as any;
  const opened = nextState(host, (st) => Object.keys(st.contests).length > 0);
  host.emit("openListing", { code: "TEST1", playerId: p.id });
  const c = Object.values((await opened).contests as Record<string, any>)[0] as any;

  const err = nextError(host);
  host.emit("bid", { code: "TEST1", contestId: c.id, amount: p.listedValue + 1, as: guestId });
  expect(await err).toMatch(/test room/i);
  expect(env.store.get("TEST1")!.contests[c.id]!.quotes).toHaveLength(1); // nothing was bid
  close(env, host, guest);
});

test("in a test room only the host may act as another seat", async () => {
  const env = await room({ capacity: 2, testMode: true });
  const host = client(env.url), guest = client(env.url);
  const { managerId: hostId } = await joinAs(host, { displayName: "H", clubId: "city" });
  await joinAs(guest, { displayName: "G", clubId: "bayern" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  const p = poolPlayer(st0) as any;
  const opened = nextState(host, (st) => Object.keys(st.contests).length > 0);
  host.emit("openListing", { code: "TEST1", playerId: p.id });
  const c = Object.values((await opened).contests as Record<string, any>)[0] as any;

  const err = nextError(guest);
  guest.emit("bid", { code: "TEST1", contestId: c.id, amount: p.listedValue + 1, as: hostId });
  expect(await err).toMatch(/only the host/i);
  expect(env.store.get("TEST1")!.contests[c.id]!.quotes).toHaveLength(1);
  close(env, host, guest);
});

test("acting as a seat that doesn't exist is refused", async () => {
  const env = await room({ capacity: 2, testMode: true });
  const host = client(env.url);
  await joinAs(host, { displayName: "H", clubId: "city" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  const p = poolPlayer(st0) as any;
  const err = nextError(host);
  host.emit("openListing", { code: "TEST1", playerId: p.id, as: "m_nobody" });
  expect(await err).toMatch(/no such seat/i);
  close(env, host);
});
