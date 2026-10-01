import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { staticHandler } from "./static.js";
import { Server } from "socket.io";
import { RoomStore, uniqueCode } from "./rooms.js";
import { Queue } from "./queue.js";
import { Db } from "./db.js";
import { RealClock } from "./clock.js";
import { Ticker } from "./timers.js";
import { attachGateway } from "./gateway.js";
import { Catalog } from "./catalog.js";
import { publicState } from "./seats.js";
import type { RoomState } from "@fcdn/shared";

const origin = process.env.WEB_ORIGIN;
if (process.env.NODE_ENV === "production" && !origin) {
  throw new Error("WEB_ORIGIN required in production");
}

// When the web app has been built (pnpm --filter web build), serve it from here too: one port, one
// public link for page + socket.io. Without a build this stays a socket-only server for `vite` dev.
const webDist = process.env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
const http = existsSync(webDist) ? createServer(staticHandler(webDist)) : createServer();
const io = new Server(http, { cors: { origin: origin ?? "*" } });
const q = new Queue<RoomState>();
const db = new Db(process.env.DB_PATH ?? "fcdn.sqlite");
const catalog = new Catalog();
const store = new RoomStore(q, db, [], uniqueCode(db), catalog.raw()) /* no built-in teams: every room comes from an uploaded roster */;
store.loadFrom(db); // crash recovery
const clock = new RealClock();
attachGateway(io, store, clock, catalog);
new Ticker(store, clock, s => io.to(s.code).emit("state", publicState(s))).start(() => q.codes());
http.listen(Number(process.env.PORT ?? 8080));
