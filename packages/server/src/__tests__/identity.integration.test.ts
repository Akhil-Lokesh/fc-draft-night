import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

/**
 * Bug 1 (HIGH — security): `join` must not honor a client-supplied `managerId` unless it
 * actually belongs to an existing manager in the room AND the claimed clubId matches that
 * manager's recorded clubId. Otherwise any client can impersonate another manager by simply
 * sending their (deterministic, guessable) managerId.
 */
test("a client cannot spoof another manager's identity by supplying their managerId on join", async () => {
  const { store, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500, capacity: 2 });

  const a = client(url);
  const aJoined = new Promise<any>(res => a.once("joined", res));
  a.emit("join", { code: "TEST1", displayName: "A", clubId: "arsenal" });
  const { managerId: realManagerId } = await aJoined;
  expect(realManagerId).toBeTruthy();

  // Impostor B claims a different club but supplies A's real managerId directly.
  const b = client(url);
  const bJoined = new Promise<any>(res => b.once("joined", res));
  b.emit("join", { code: "TEST1", displayName: "Impostor", clubId: "bayern", managerId: realManagerId });
  const { managerId: bManagerId } = await bJoined;

  // B must NOT be handed A's managerId.
  expect(bManagerId).not.toBe(realManagerId);

  // Start the draft so a war/challenge command is meaningful.
  const started = new Promise<any>(res => a.on("state", (st: any) => { if (st.status === "live") res(st); }));
  a.emit("start", { code: "TEST1" });
  const liveState = await started;

  // Find a player actually owned by A's (arsenal) manager, to prove B cannot act as A.
  const arsenalPlayer = Object.values(liveState.players as Record<string, any>)
    .find((p: any) => p.ownerId === realManagerId) as any;
  expect(arsenalPlayer).toBeTruthy();

  // B attempts to release/list A's own player via openListing — should fail since B's real
  // identity (bManagerId) does not own this player.
  const bError = new Promise<string>(res => b.once("error", res));
  b.emit("openListing", { code: "TEST1", playerId: arsenalPlayer.id });
  const errMsg = await bError;
  expect(errMsg).toMatch(/owned by another manager/i);

  a.close(); b.close(); io.close(); http.close();
});

/**
 * A genuinely different person must not be silently fused into an existing manager just
 * because they pick the same club with no managerId — that would let two people share one
 * squad/budget unknowingly. Only the same displayName (a same-person reconnect from a fresh
 * device/cleared storage) may reattach without a managerId; anyone else gets "club taken".
 */
test("two different people cannot both take the same club", async () => {
  const { store, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 });
  const a = client(url);
  await new Promise<any>(res => a.once("joined", res).emit("join", { code: "TEST1", displayName: "A", clubId: "real" }));

  const b = client(url);
  const bErr = new Promise<string>(res => b.once("error", res));
  b.emit("join", { code: "TEST1", displayName: "Someone Else", clubId: "real" });
  const message = await bErr;
  expect(message).toMatch(/taken/i);

  a.close(); b.close(); io.close(); http.close();
});
