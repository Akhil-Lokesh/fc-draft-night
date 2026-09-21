import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

/**
 * Proves the gateway wiring for host pool curation: a client can search the full FC26 catalog
 * over the socket, curate a set of pool-eligible players into a room via `setPool`, and see them
 * land in room state as unowned/unlocked players — but only while the room is still in "setup".
 * Once the draft is live, `setPool` must be rejected.
 */
test("searchCatalog + setPool inserts pool-eligible players pre-draft, and is rejected once live", async () => {
  const db = new Db(":memory:");
  const clock = new FakeClock(0);
  const { store, url, io } = await boot(db, clock, "POOL1");

  await store.create({ totalBudget: 1500 });

  const a = client(url);
  const joined = new Promise<any>(res => a.on("state", res));
  a.emit("join", { code: "POOL1", displayName: "A", clubId: "city" });
  await joined;

  // Search the real catalog for a known pool-eligible player.
  const results = await new Promise<any[]>(res => {
    a.once("catalogResults", res);
    a.emit("searchCatalog", { q: "wirtz", limit: 5 });
  });
  expect(results.length).toBeGreaterThan(0);
  const wirtz = results[0];
  expect(wirtz.clubId).toBe(null);

  // Curate the pool while the room is still in "setup".
  const afterPool = new Promise<any>(res => a.on("state", (st: any) => {
    if (st.players[wirtz.id]) res(st);
  }));
  a.emit("setPool", { code: "POOL1", ids: [wirtz.id] });
  const poolState = await afterPool;

  expect(poolState.players[wirtz.id]).toBeTruthy();
  expect(poolState.players[wirtz.id].ownerId).toBe(null);
  expect(poolState.players[wirtz.id].lockedThisSeason).toBe(false);

  // Start the draft — room moves to "live".
  const afterStart = new Promise<any>(res => a.on("state", (st: any) => { if (st.status === "live") res(st); }));
  a.emit("start", { code: "POOL1" });
  await afterStart;

  // setPool is rejected once the draft has started.
  const rejection = new Promise<string>(res => a.once("error", res));
  a.emit("setPool", { code: "POOL1", ids: [wirtz.id] });
  const errMsg = await rejection;
  expect(errMsg).toMatch(/setup|started/i);

  a.close();
  io.close();
});
