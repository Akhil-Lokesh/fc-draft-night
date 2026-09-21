import { createServer } from "node:http";
import { Server } from "socket.io";
import { RoomStore } from "./rooms.js";
import { Queue } from "./queue.js";
import { Db } from "./db.js";
import { RealClock } from "./clock.js";
import { Ticker } from "./timers.js";
import { attachGateway } from "./gateway.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

const origin = process.env.WEB_ORIGIN;
if (process.env.NODE_ENV === "production" && !origin) {
  throw new Error("WEB_ORIGIN required in production");
}

const http = createServer();
const io = new Server(http, { cors: { origin: origin ?? "*" } });
const q = new Queue<RoomState>();
const db = new Db(process.env.DB_PATH ?? "fcdn.sqlite");
const store = new RoomStore(q, db, loadSeed());
store.loadFrom(db); // crash recovery
const clock = new RealClock();
attachGateway(io, store, clock);
new Ticker(store, clock, s => io.to(s.code).emit("state", s)).start(() => q.codes());
http.listen(Number(process.env.PORT ?? 8080));
