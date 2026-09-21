import type { Server, Socket } from "socket.io";
import { applyCommand, type RoomState } from "@fcdn/shared";
import type { RoomStore } from "./rooms.js";
import type { Clock } from "./clock.js";

export function attachGateway(io: Server, store: RoomStore, clock: Clock) {
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
  });
}
