import type { Server, Socket } from "socket.io";
import { addPoolPlayer, applyCommand, type RoomState } from "@fcdn/shared";
import type { RoomStore } from "./rooms.js";
import type { Clock } from "./clock.js";
import { Catalog } from "./catalog.js";

export function attachGateway(io: Server, store: RoomStore, clock: Clock, catalog: Catalog = new Catalog()) {
  const broadcast = (code: string) => { const s = store.get(code); if (s) io.to(code).emit("state", s); };

  io.on("connection", (socket: Socket) => {
    let joined: { code: string; managerId: string } | null = null;

    socket.on("join", async (p: { code: string; displayName: string; clubId: string; managerId?: string }) => {
      try {
        const existing = store.get(p.code);
        const managerId = p.managerId
          ?? (existing && Object.values(existing.managers).find(m => m.clubId === p.clubId)?.id)
          ?? (await store.join(p.code, { displayName: p.displayName, clubId: p.clubId })).managerId;
        joined = { code: p.code, managerId };
        socket.join(p.code);
        socket.emit("joined", { managerId }); // client stores this for reconnection
        broadcast(p.code);
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });

    const cmd = (code: string, make: (s: RoomState) => Parameters<typeof applyCommand>[1]) =>
      store.run(code, (s: RoomState) => applyCommand(s, make(s))).then(() => broadcast(code)).catch((e: Error) => socket.emit("error", e.message));

    socket.on("start", (p: { code: string }) => cmd(p.code, () => ({ type: "StartDraft", now: clock.now() })));
    // OpenListing = claim a pool player or release your own (server infers which from ownership).
    socket.on("openListing", (p: { code: string; playerId: string }) =>
      cmd(p.code, () => ({ type: "OpenListing", managerId: joined!.managerId, playerId: p.playerId, now: clock.now() })));
    // Challenge = go after a player owned by a rival; the client must name its opening bid.
    socket.on("challenge", (p: { code: string; playerId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "Challenge", managerId: joined!.managerId, playerId: p.playerId, amount: p.amount, now: clock.now() })));
    socket.on("bid", (p: { code: string; contestId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "PlaceBid", contestId: p.contestId, managerId: joined!.managerId, amount: p.amount, now: clock.now() })));

    // Stateless request/response over the full FC26 catalog — no room mutation.
    socket.on("searchCatalog", (q: { q?: string; position?: string; club?: string; limit?: number }) => {
      socket.emit("catalogResults", catalog.search(q));
    });

    // Host curates which pool-eligible catalog players join this room's draft pool.
    // Only allowed pre-draft (room status "setup") — the pool is fixed once the draft starts.
    socket.on("setPool", async (p: { code: string; ids: string[] }) => {
      try {
        const existing = store.get(p.code);
        if (!existing) throw new Error("no such room");
        if (existing.status !== "setup") throw new Error("cannot set pool once the draft has started");
        const players = catalog.byIds(p.ids);
        await store.run(p.code, (s: RoomState) => {
          let next = s;
          for (const player of players) next = addPoolPlayer(next, player);
          return { state: next, events: [] };
        });
        broadcast(p.code);
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });
  });
}
