import { createServer } from "node:http";
import { Server } from "socket.io";
import { attachGateway } from "../gateway.js";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Catalog } from "../catalog.js";
import type { Db } from "../db.js";
import type { Clock } from "../clock.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

/** Boot a real http + socket.io server wired to a RoomStore, backed by an injectable Db and Clock
 *  so callers can share a Db instance across "crash" boundaries and control time deterministically. */
export async function boot(db: Db, clock: Clock, roomCode = "TEST1") {
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  const q = new Queue<RoomState>();
  const catalog = new Catalog();
  const store = new RoomStore(q, db, loadSeed(), () => roomCode, catalog.raw());
  attachGateway(io, store, clock, catalog);
  await new Promise<void>(r => http.listen(0, r));
  const port = (http.address() as any).port;
  return { http, io, store, q, url: `http://localhost:${port}` };
}
