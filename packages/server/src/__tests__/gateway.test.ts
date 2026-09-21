import { test, expect } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";
import { attachGateway } from "../gateway.js";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

async function boot() {
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  const q = new Queue<RoomState>();
  const store = new RoomStore(q, new Db(":memory:"), loadSeed(), () => "TEST1");
  attachGateway(io, store, new FakeClock(0));
  await new Promise<void>(r => http.listen(0, r));
  const port = (http.address() as any).port;
  return { http, io, store, url: `http://localhost:${port}` };
}

test("a joined client receives a state broadcast, and a challenge propagates to a second client", async () => {
  const { store, url, http, io } = await boot();
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
