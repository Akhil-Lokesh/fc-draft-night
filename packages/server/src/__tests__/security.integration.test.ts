import { test, expect } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

const joinAs = (c: Socket, p: Record<string, unknown>) =>
  new Promise<any>((res, rej) => { c.once("joined", res); c.once("error", rej); c.emit("join", { code: "TEST1", ...p }); });
const nextError = (c: Socket) => new Promise<string>(res => c.once("error", res));

async function room() {
  const env = await boot(new Db(":memory:"), new FakeClock(0));
  await env.store.create({ totalBudget: 1500 });
  return env;
}

test("joining hands this socket a secret seat key, and states sent to clients never include any key", async () => {
  const { url, io, http } = await room();
  const a = client(url);
  const state = new Promise<any>(res => a.once("state", res));
  const joined = await joinAs(a, { displayName: "A", clubId: "city" });
  expect(joined.seatKey).toMatch(/^[\w-]{20,}$/);
  const st = await state;
  expect(st.seatKeys).toBeUndefined();
  expect(JSON.stringify(st)).not.toContain(joined.seatKey);
  a.close(); io.close(); http.close();
});

test("the seat key reattaches its owner after a refresh", async () => {
  const { url, io, http } = await room();
  const a = client(url);
  const { managerId, seatKey } = await joinAs(a, { displayName: "A", clubId: "city" });
  a.close();
  const again = client(url);
  const back = await joinAs(again, { displayName: "A", clubId: "city", seatKey });
  expect(back.managerId).toBe(managerId);
  again.close(); io.close(); http.close();
});

test("a stranger can't take over a seat with its guessable manager id or the owner's display name", async () => {
  const { url, io, http } = await room();
  const a = client(url);
  await joinAs(a, { displayName: "A", clubId: "city" });
  const thief = client(url);
  await expect(joinAs(thief, { displayName: "A", clubId: "city", managerId: "m_city" })).rejects.toMatch(/taken/);
  await expect(joinAs(thief, { displayName: "A", clubId: "city", seatKey: "made-up-key-made-up-key" })).rejects.toMatch(/taken/);
  a.close(); thief.close(); io.close(); http.close();
});

test("only the host can start or end the draft", async () => {
  const { url, io, http, store } = await room();
  const host = client(url), guest = client(url);
  await joinAs(host, { displayName: "H", clubId: "city" });
  await joinAs(guest, { displayName: "G", clubId: "bayern" });

  let err = nextError(guest);
  guest.emit("start", { code: "TEST1" });
  expect(await err).toMatch(/only the host/);
  expect(store.get("TEST1")!.status).toBe("setup");

  const live = new Promise<void>(res => guest.on("state", (st: any) => { if (st.status === "live") res(); }));
  host.emit("start", { code: "TEST1" });
  await live;

  err = nextError(guest);
  guest.emit("endDraft", { code: "TEST1" });
  expect(await err).toMatch(/only the host/);
  expect(store.get("TEST1")!.status).toBe("live");
  host.close(); guest.close(); io.close(); http.close();
});

test("a player joined in one room can't send commands into another room", async () => {
  const { url, io, http, store, q } = await room();
  q.setState("TEST2", { ...store.get("TEST1")!, code: "TEST2" }); // a second, separate room
  const owner2 = client(url);
  await new Promise<any>(res => owner2.once("joined", res).emit("join", { code: "TEST2", displayName: "O", clubId: "city" }));
  const intruder = client(url);
  await joinAs(intruder, { displayName: "I", clubId: "city" }); // host of TEST1
  const err = nextError(intruder);
  intruder.emit("endDraft", { code: "TEST2" });
  expect(await err).toMatch(/must join/);
  expect(store.get("TEST2")!.status).toBe("setup");
  owner2.close(); intruder.close(); io.close(); http.close();
});

test("the room's creator is host even if someone else joins first; nobody else can claim it", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const creator = client(url), stranger = client(url);
  const { code, hostKey } = await new Promise<any>(res => { creator.once("created", res); creator.emit("create", { totalBudget: 1500 }); });
  expect(hostKey).toBeTruthy();

  // A stranger gets in first (and tries a made-up host key) — still not host.
  await new Promise<any>(res => stranger.once("joined", res).emit("join", { code, displayName: "S", clubId: "bayern", hostKey: "guess-guess-guess-guess" }));
  let err = nextError(stranger);
  stranger.emit("start", { code });
  expect(await err).toMatch(/only the host/);

  const st = new Promise<any>(res => creator.on("state", (s: any) => { if (s.hostId) res(s); }));
  await new Promise<any>(res => creator.once("joined", res).emit("join", { code, displayName: "C", clubId: "city", hostKey }));
  const s = await st;
  expect(s.hostId).toBe("m_city");
  expect(s.hostKeyHash).toBeUndefined();

  err = nextError(stranger);
  stranger.emit("endDraft", { code });
  expect(await err).toMatch(/only the host/);
  creator.close(); stranger.close(); io.close(); http.close();
});
