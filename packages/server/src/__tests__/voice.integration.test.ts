import { test, expect } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";
import { iceServers } from "../voice.js";

const once = <T = any>(c: Socket, ev: string) => new Promise<T>((res) => c.once(ev, res));
const join = async (c: Socket, code: string, clubId: string) => {
  const j = once(c, "joined");
  c.emit("join", { code, displayName: clubId, clubId });
  return j;
};

async function room() {
  const env = await boot(new Db(":memory:"), new FakeClock(0));
  await env.store.create({ totalBudget: 1500 });
  return env;
}

test("joining voice returns ICE servers and the members already in the call; everyone gets the roster", async () => {
  const { url, io, http } = await room();
  const a = client(url), b = client(url);
  await join(a, "TEST1", "city");
  await join(b, "TEST1", "bayern");

  const aWelcome = once(a, "voice:welcome");
  a.emit("voice:join", { code: "TEST1" });
  expect((await aWelcome).peers).toEqual([]); // first one in

  const bWelcome = once(b, "voice:welcome");
  const aRoster = new Promise<any>((res) => a.on("voice:roster", (r: any) => { if (r.members.length === 2) res(r); }));
  b.emit("voice:join", { code: "TEST1" });
  const w = await bWelcome;
  expect(w.iceServers[0].urls[0]).toMatch(/^stun:/);
  expect(w.peers.map((p: any) => p.managerId)).toEqual(["m_city"]); // b calls a
  expect((await aRoster).members.map((m: any) => m.managerId).sort()).toEqual(["m_bayern", "m_city"]);
  a.close(); b.close(); io.close(); http.close();
});

test("signals are relayed between call members, stamped with the real sender", async () => {
  const { url, io, http } = await room();
  const a = client(url), b = client(url);
  await join(a, "TEST1", "city");
  await join(b, "TEST1", "bayern");
  a.emit("voice:join", { code: "TEST1" }); await once(a, "voice:welcome");
  b.emit("voice:join", { code: "TEST1" }); await once(b, "voice:welcome");

  const got = once<any>(a, "voice:signal");
  b.emit("voice:signal", { code: "TEST1", to: "m_city", data: { sdp: { type: "offer", sdp: "x" } } });
  const sig = await got;
  expect(sig.from).toBe("m_bayern");
  expect(sig.data.sdp.type).toBe("offer");
  a.close(); b.close(); io.close(); http.close();
});

test("a socket that hasn't joined the room can't enter its call or send it signals", async () => {
  const { url, io, http } = await room();
  const a = client(url), outsider = client(url);
  await join(a, "TEST1", "city");
  a.emit("voice:join", { code: "TEST1" }); await once(a, "voice:welcome");

  const err = once<string>(outsider, "error");
  outsider.emit("voice:join", { code: "TEST1" });
  expect(await err).toMatch(/must join/);

  let leaked = false;
  a.on("voice:signal", () => { leaked = true; });
  outsider.emit("voice:signal", { code: "TEST1", to: "m_city", data: {} });
  await new Promise((r) => setTimeout(r, 100));
  expect(leaked).toBe(false);
  a.close(); outsider.close(); io.close(); http.close();
});

test("a seated manager who hasn't joined the call can't push signals into it", async () => {
  const { url, io, http } = await room();
  const a = client(url), b = client(url);
  await join(a, "TEST1", "city");
  await join(b, "TEST1", "bayern"); // seated, but never joins voice
  a.emit("voice:join", { code: "TEST1" }); await once(a, "voice:welcome");
  let leaked = false;
  a.on("voice:signal", () => { leaked = true; });
  b.emit("voice:signal", { code: "TEST1", to: "m_city", data: {} });
  await new Promise((r) => setTimeout(r, 100));
  expect(leaked).toBe(false);
  a.close(); b.close(); io.close(); http.close();
});

test("mute shows in the roster, and disconnecting drops you from the call", async () => {
  const { url, io, http } = await room();
  const a = client(url), b = client(url);
  await join(a, "TEST1", "city");
  await join(b, "TEST1", "bayern");
  a.emit("voice:join", { code: "TEST1" }); await once(a, "voice:welcome");
  b.emit("voice:join", { code: "TEST1" }); await once(b, "voice:welcome");

  const muted = new Promise<any>((res) => a.on("voice:roster", (r: any) => { if (r.members.find((m: any) => m.managerId === "m_bayern")?.muted) res(r); }));
  b.emit("voice:mute", { code: "TEST1", muted: true });
  await muted;

  const gone = new Promise<any>((res) => a.on("voice:roster", (r: any) => { if (r.members.length === 1) res(r); }));
  b.close();
  expect((await gone).members[0].managerId).toBe("m_city");
  a.close(); io.close(); http.close();
});

test("TURN relay servers come from the environment when configured", () => {
  expect(iceServers({}).length).toBe(1);
  const s = iceServers({ TURN_URLS: "turn:relay.example:80, turns:relay.example:443", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" });
  expect(s[1]).toEqual({ urls: ["turn:relay.example:80", "turns:relay.example:443"], username: "u", credential: "p" });
});
