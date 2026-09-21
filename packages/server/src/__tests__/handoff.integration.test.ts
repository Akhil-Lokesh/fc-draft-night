import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

/**
 * Proves the gateway wiring for season handoff end-to-end over real sockets:
 *  1. exportSeason returns a CSV (via a `seasonExport` event) with the expected sections.
 *  2. importSeason, given a filled-in finishing-order CSV, opens season N+1 and broadcasts
 *     the rebased state to the room.
 */
test("exportSeason returns a CSV with the expected sections", async () => {
  const { store, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0), "EXPORT1");
  await store.create({ totalBudget: 1500 });

  const a = client(url);
  const joined = new Promise<any>(res => a.on("state", res));
  a.emit("join", { code: "EXPORT1", displayName: "A", clubId: "city" });
  await joined;

  const exportResult = await new Promise<any>(res => {
    a.once("seasonExport", res);
    a.emit("exportSeason", { code: "EXPORT1" });
  });

  expect(typeof exportResult.csv).toBe("string");
  expect(exportResult.csv).toMatch(/## MANAGERS/);
  expect(exportResult.csv).toMatch(/## SQUADS/);
  expect(exportResult.csv).toMatch(/## LOG/);
  expect(exportResult.csv).toMatch(/finishingPosition/);
  expect(exportResult.filename).toMatch(/^fcdn-season-1-EXPORT1\.csv$/);

  a.close(); io.close(); http.close();
});

test("importSeason with a filled-in CSV opens season N+1 and broadcasts the rebased state", async () => {
  const { store, q, url, io, http } = await boot(new Db(":memory:"), new FakeClock(0), "IMPORT1");
  await store.create({ totalBudget: 1500 });

  const a = client(url), b = client(url);
  const aJoined = new Promise<any>(res => a.on("state", res));
  const bJoined = new Promise<any>(res => b.on("state", res));
  a.emit("join", { code: "IMPORT1", displayName: "Real", clubId: "real" });
  await aJoined;
  b.emit("join", { code: "IMPORT1", displayName: "Bayern", clubId: "bayern" });
  await bJoined;

  // Close the room server-side so export/import reflect a finished season (same pattern as
  // handoff.test.ts's unit test: force status to "closed" directly on the stored state).
  const existing = store.get("IMPORT1")!;
  q.setState("IMPORT1", { ...existing, status: "closed" as const });

  const exportResult = await new Promise<any>(res => {
    a.once("seasonExport", res);
    a.emit("exportSeason", { code: "IMPORT1" });
  });

  // Fill finishing positions: Bayern finished 1st, Real finished 2nd (of these 2 joined managers).
  const filledCsv = (exportResult.csv as string)
    .replace(/(m_real,[^\n]*),$/m, "$1,2")
    .replace(/(m_bayern,[^\n]*),$/m, "$1,1");

  const bNextState = new Promise<any>(res => b.on("state", (st: any) => { if (st.seasonNumber === 2) res(st); }));
  a.emit("importSeason", { code: "IMPORT1", csv: filledCsv, base: 600, step: 20 });
  const nextState = await bNextState;

  expect(nextState.seasonNumber).toBe(2);
  expect(nextState.status).toBe("setup");

  a.close(); b.close(); io.close(); http.close();
});
