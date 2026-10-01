import { test, expect } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { Catalog } from "../catalog.js";
import { boot } from "./helpers.js";

const joinAs = (c: Socket, p: Record<string, unknown>) =>
  new Promise<any>((res, rej) => { c.once("joined", res); c.once("error", rej); c.emit("join", { code: "TEST1", ...p }); });
const nextError = (c: Socket) => new Promise<string>((res) => c.once("error", res));
const nextState = (c: Socket, ok: (st: any) => boolean) => new Promise<any>((res) => c.on("state", (st: any) => { if (ok(st)) res(st); }));

/** Real Madrid's squad plus two more stars is worth ~1730M against a 5-star budget of 1500M: a real starting deficit. */
async function overBudgetRoom() {
  const env = await boot(new Db(":memory:"), new FakeClock(0));
  const catalog = new Catalog().raw();
  const real = catalog.filter((p) => p.club === "Real Madrid");
  const extras = catalog.filter((p) => p.club !== "Real Madrid").sort((a, b) => b.value - a.value).slice(0, 2);
  const csv = "club,player\n" + [...real, ...extras].map((p) => `Real Madrid,${p.name}`).join("\n") + "\nArsenal,B. Saka\n";
  await env.store.create({ totalBudget: 1500, rosterCsv: csv, capacity: 2 });
  return env;
}

test("the auction can't end while a manager is over budget, until they release enough players themselves", async () => {
  const env = await overBudgetRoom();
  const host = client(env.url), guest = client(env.url);
  const { managerId } = await joinAs(host, { displayName: "Ana", clubId: "real-madrid" });
  await joinAs(guest, { displayName: "Bo", clubId: "arsenal" });
  const live = nextState(host, (st) => st.status === "live");
  host.emit("start", { code: "TEST1" });
  const st0 = await live;
  expect(st0.managers[managerId].spendable).toBeLessThan(0); // started in the red

  // the host tries to end it: refused, nothing changes
  const err = nextError(host);
  host.emit("endDraft", { code: "TEST1" });
  expect(await err).toMatch(/over budget/i);
  expect(env.store.get("TEST1")!.status).toBe("live");

  // nobody released anyone for them
  const owned = () => Object.values(env.store.get("TEST1")!.players).filter((p) => p.ownerId === managerId);
  const before = owned().length;
  expect(before).toBeGreaterThan(20);

  // Ana releases her two priciest players herself, which is enough to get back above zero
  const top = [...owned()].sort((a, b) => b.listedValue - a.listedValue).slice(0, 2);
  for (const p of top) host.emit("openListing", { code: "TEST1", playerId: p.id });
  const solvent = await nextState(host, (st) => st.managers[managerId].spendable >= 0);
  expect(solvent.managers[managerId].spendable).toBeGreaterThanOrEqual(0);
  expect(owned().length).toBe(before - 2);

  // now it can end
  const closed = nextState(host, (st) => st.status === "closed");
  host.emit("endDraft", { code: "TEST1" });
  expect((await closed).status).toBe("closed");
  host.close(); guest.close(); env.io.close(); env.http.close();
});
