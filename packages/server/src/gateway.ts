import type { Server, Socket } from "socket.io";
import { addPoolPlayer, applyCommand, cancelLeave, hostOf, requestLeave, resolveLeave, type RoomState } from "@fcdn/shared";
import type { RoomStore } from "./rooms.js";
import type { Clock } from "./clock.js";
import { Catalog } from "./catalog.js";
import { exportSeasonCsv } from "./export.js";
import { slugifyClub } from "./clubs.js";
import { hashSeatKey, newSeatKey, publicState, seatFor } from "./seats.js";
import { attachVoice, VoiceRooms } from "./voice.js";

export function attachGateway(io: Server, store: RoomStore, clock: Clock, catalog: Catalog = new Catalog()) {
  const broadcast = (code: string) => { const s = store.get(code); if (s) io.to(code).emit("state", publicState(s)); };

  const voice = new VoiceRooms();

  io.on("connection", (socket: Socket) => {
    let joined: { code: string; managerId: string } | null = null;
    const voiceSeat = attachVoice(io, socket, voice, () => joined);

    // Host creates the room and gets back a shareable code, then joins as the first manager.
    // Kept separate from `join` so a room only ever comes into existence through this one path
    // (join throws "no such room" for an unknown code — it never auto-creates).
    socket.on("create", async (p: { totalBudget: number; quoteTimerMs?: number; squadSizeCap?: number | null; capacity?: number; rosterCsv?: string }) => {
      try {
        const { code } = await store.create(p);
        // Only the creator learns this key; their join carrying it is what makes them host.
        const hostKey = newSeatKey(), hash = hashSeatKey(hostKey);
        await store.run(code, (s: RoomState) => ({ state: { ...s, hostKeyHash: hash }, events: [] }));
        socket.emit("created", { code, hostKey });
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });

    // Identity is a secret seat key, never anything guessable. Manager ids are `m_<clubId>` and
    // display names are public, so a client naming either proves nothing. Flow:
    //  - a seatKey that matches a seat in this room reattaches to that seat (reconnect/refresh);
    //  - a club someone already holds is "club taken" — unless that seat predates seat keys and
    //    the display name matches, in which case it's claimed once and gets a key from then on;
    //  - otherwise it's a brand-new manager, who gets a fresh key.
    // The raw key goes back to this socket alone; the room stores only its hash.
    socket.on("join", async (p: { code: string; displayName: string; clubId: string; seatKey?: string; hostKey?: string }) => {
      try {
        const existing = store.get(p.code);
        if (!existing) throw new Error("no such room");
        let managerId = seatFor(existing, p.seatKey);
        let issue = false;
        if (!managerId) {
          const holder = Object.values(existing.managers).find(m => m.clubId === p.clubId);
          if (holder) {
            const legacy = !existing.seatKeys?.[holder.id] && holder.displayName === p.displayName;
            if (!legacy) throw new Error("club taken");
            managerId = holder.id;
          } else {
            managerId = (await store.join(p.code, { displayName: p.displayName, clubId: p.clubId })).managerId;
          }
          issue = true;
        }
        // The creator's first join: claim the host seat and retire the key.
        const cur = store.get(p.code)!;
        if (p.hostKey && !cur.hostId && cur.hostKeyHash === hashSeatKey(p.hostKey)) {
          const id = managerId;
          await store.run(p.code, (s: RoomState) => {
            const { hostKeyHash: _used, ...rest } = s;
            return { state: { ...rest, hostId: id }, events: [] };
          });
        }
        let seatKey: string | undefined;
        if (issue) {
          seatKey = newSeatKey();
          const id = managerId, hash = hashSeatKey(seatKey);
          await store.run(p.code, (s: RoomState) => ({ state: { ...s, seatKeys: { ...s.seatKeys, [id]: hash } }, events: [] }));
        }
        if (joined && joined.code !== p.code) voiceSeat.dropOut(); // switching rooms leaves the old call
        joined = { code: p.code, managerId };
        socket.join(p.code);
        socket.emit("joined", seatKey ? { managerId, seatKey } : { managerId }); // client keeps the key to rejoin
        voiceSeat.rosterTo(p.code); // who's already talking, before this manager joins voice
        broadcast(p.code);
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });

    // Lets the Join screen show live capacity/taken-clubs before the player has actually
    // joined (and thus before their socket is in the room and would receive `state`).
    socket.on("peekRoom", (p: { code: string }) => {
      try {
        // A miss is an ordinary answer, not an error: the Join screen peeks on every keystroke, so
        // half-typed codes miss all the time. Each reply names its code so the client can drop stale ones.
        const existing = store.get(p.code);
        if (!existing) { socket.emit("roomPeek", { code: p.code, found: false }); return; }
        socket.emit("roomPeek", {
          code: p.code,
          found: true,
          capacity: existing.capacity,
          takenClubs: Object.values(existing.managers).map(m => m.clubId),
          managerCount: Object.keys(existing.managers).length,
          allClubs: Object.entries(existing.clubNames ?? {}).map(([id, label]) => ({ id, label })),
        });
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });

    // Client walked away from a room (e.g. "Home" after a draft closes): stop sending it that
    // room's broadcasts, and forget the join so commands can't target it by accident.
    socket.on("leave", (p: { code: string }) => {
      socket.leave(p.code);
      if (joined?.code === p.code) joined = null;
    });

    // Leaving the lobby needs the host's say-so: a guest asks, the host allows or declines.
    // Allowing removes that manager from the room entirely, freeing their club for someone else.
    // All three act on the joined identity only, never a client-named manager.
    const leaveCmd = (code: string, reduce: (s: RoomState, me: string) => RoomState) => {
      if (!mine(code)) return;
      const me = joined!.managerId;
      return store.run(code, (s: RoomState) => ({ state: reduce(s, me), events: [] }))
        .then(() => broadcast(code))
        .catch((e: Error) => socket.emit("error", e.message));
    };
    socket.on("requestLeave", (p: { code: string }) => leaveCmd(p.code, (s, me) => requestLeave(s, me)));
    socket.on("cancelLeave", (p: { code: string }) => leaveCmd(p.code, (s, me) => cancelLeave(s, me)));
    socket.on("resolveLeave", (p: { code: string; managerId: string; allow: boolean }) =>
      leaveCmd(p.code, (s, me) => resolveLeave(s, me, p.managerId, p.allow)));

    /** The room this socket actually joined, or an error — commands never reach another room
     *  just because the client named its code. */
    const mine = (code: string): { code: string; managerId: string } | null => {
      if (!joined || joined.code !== code) { socket.emit("error", "must join before sending commands"); return null; }
      return joined;
    };
    /** Same, and the joined manager must be this room's host. */
    const asHost = (code: string): boolean => {
      const me = mine(code);
      if (!me) return false;
      const s = store.get(code);
      if (!s || hostOf(s) !== me.managerId) { socket.emit("error", "only the host can do that"); return false; }
      return true;
    };

    const cmd = (code: string, make: (s: RoomState) => Parameters<typeof applyCommand>[1]) => {
      if (!mine(code)) return;
      return store.run(code, (s: RoomState) => applyCommand(s, make(s))).then(() => broadcast(code)).catch((e: Error) => socket.emit("error", e.message));
    };

    // Only a full room may start: the check runs inside the room's queue, so a join racing the start can't slip past it.
    socket.on("start", (p: { code: string }) => {
      if (!asHost(p.code)) return;
      cmd(p.code, (s) => {
        const missing = s.capacity - Object.keys(s.managers).length;
        if (missing > 0) throw new Error(`waiting for ${missing} more manager${missing === 1 ? "" : "s"}`);
        return { type: "StartDraft", now: clock.now() };
      });
    });
    // OpenListing = claim a pool player or release your own (server infers which from ownership).
    socket.on("openListing", (p: { code: string; playerId: string }) =>
      cmd(p.code, () => ({ type: "OpenListing", managerId: joined!.managerId, playerId: p.playerId, now: clock.now() })));
    // Challenge = go after a player owned by a rival; the client must name its opening bid.
    socket.on("challenge", (p: { code: string; playerId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "Challenge", managerId: joined!.managerId, playerId: p.playerId, amount: p.amount, now: clock.now() })));
    socket.on("bid", (p: { code: string; contestId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "PlaceBid", contestId: p.contestId, managerId: joined!.managerId, amount: p.amount, now: clock.now() })));
    // Forfeit = a manager involved in the war gives up; owner giving up ends it now, anyone
    // else giving up just drops them from further bidding (server-side rules in domain/war.ts).
    socket.on("forfeit", (p: { code: string; contestId: string }) =>
      cmd(p.code, () => ({ type: "Forfeit", contestId: p.contestId, managerId: joined!.managerId, now: clock.now() })));
    // Host-only: force-resolve every open contest right now and close the room.
    socket.on("endDraft", (p: { code: string }) => { if (asHost(p.code)) cmd(p.code, () => ({ type: "EndDraft", now: clock.now() })); });

    // Stateless request/response over the full FC26 catalog — no room mutation.
    // With a room code it leaves out players already in that room (squads and pool), so the host
    // is only offered people who can still be added.
    socket.on("searchCatalog", (q: { q?: string; position?: string; club?: string; limit?: number; code?: string }) => {
      const room = q.code ? store.get(q.code) : undefined;
      socket.emit("catalogResults", catalog.search(q, room ? new Set(Object.keys(room.players)) : undefined));
    });

    // Host curates which pool-eligible catalog players join this room's draft pool.
    // Only allowed pre-draft (room status "setup") — the pool is fixed once the draft starts.
    socket.on("setPool", async (p: { code: string; ids: string[] }) => {
      if (!asHost(p.code)) return;
      try {
        const existing = store.get(p.code);
        if (!existing) throw new Error("no such room");
        if (existing.status !== "setup") throw new Error("cannot set pool once the draft has started");
        // A room built from an uploaded roster may reserve clubs the global catalog doesn't
        // itself know are "taken" (only the built-in 5 are pre-tagged) — re-derive it here so
        // the host can never accidentally pool a player already owned by one of this room's managers.
        const takenClubIds = new Set(Object.values(existing.managers).map(m => m.clubId));
        const players = catalog.byIds(p.ids).filter(pl => !takenClubIds.has(slugifyClub(pl.club)));
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

    // Season handoff: export the closed room's CSV (managers get a blank finishing-position
    // column to fill in), then re-import that filled CSV to open season N+1.
    socket.on("exportSeason", (p: { code: string }) => {
      if (!mine(p.code)) return;
      const s = store.get(p.code);
      if (!s) { socket.emit("error", "no such room"); return; }
      const { csv, filename } = exportSeasonCsv(s);
      socket.emit("seasonExport", { csv, filename });
    });
    socket.on("importSeason", async (p: { code: string; csv: string; base: number; step: number }) => {
      if (!asHost(p.code)) return;
      try {
        const state = await store.applyHandoff(p.code, p.csv, { base: p.base, step: p.step });
        io.to(p.code).emit("state", publicState(state));
      } catch (e) {
        socket.emit("error", (e as Error).message);
      }
    });
  });
}
