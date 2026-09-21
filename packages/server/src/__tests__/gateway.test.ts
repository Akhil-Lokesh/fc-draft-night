import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

test("a joined client receives a state broadcast, and a challenge propagates to a second client", async () => {
  const { store, url, http, io } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 }); // real FC26 dataset's budget floor
  const a = client(url), b = client(url);

  const bothJoined = new Promise<any>(res => b.on("state", res));
  a.emit("join", { code: "TEST1", displayName: "A", clubId: "city" });
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
