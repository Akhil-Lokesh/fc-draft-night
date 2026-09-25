import type { Server, Socket } from "socket.io";

/** One manager's seat in a room's voice call. `sid` changes on every (re)join, so peers know to
 *  drop a stale connection when someone refreshes. */
export interface VoiceMember { managerId: string; socketId: string; sid: string; muted: boolean }

/** ICE servers handed to clients. STUN finds each browser's public address; TURN relays audio for
 *  friends whose router or mobile network blocks a direct connection. Configure TURN with
 *  TURN_URLS (comma-separated), TURN_USERNAME and TURN_CREDENTIAL. */
export function iceServers(env: NodeJS.ProcessEnv = process.env): RTCIceServerLike[] {
  const servers: RTCIceServerLike[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  const turn = env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length) servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return servers;
}
export interface RTCIceServerLike { urls: string[]; username?: string; credential?: string }

/** Voice is peer-to-peer (WebRTC): audio flows directly between browsers. The server is only the
 *  matchmaker — it tells members who else is in the call and relays their connection offers.
 *  Membership is per room and only for managers seated in that room (the gateway's `joined`),
 *  and a signal is only relayed between two members of the same room's call. */
export class VoiceRooms {
  private rooms = new Map<string, Map<string, VoiceMember>>();
  private seq = 0;

  members(code: string): VoiceMember[] {
    return [...(this.rooms.get(code)?.values() ?? [])];
  }

  join(code: string, managerId: string, socketId: string): VoiceMember {
    const room = this.rooms.get(code) ?? this.rooms.set(code, new Map()).get(code)!;
    const m: VoiceMember = { managerId, socketId, sid: `${socketId}:${++this.seq}`, muted: false };
    room.set(managerId, m); // a refresh replaces the old seat
    return m;
  }

  /** Leave, but only if this socket still holds the seat (a stale socket can't evict a fresh one). */
  leave(code: string, managerId: string, socketId: string): boolean {
    const room = this.rooms.get(code);
    const m = room?.get(managerId);
    if (!room || !m || m.socketId !== socketId) return false;
    room.delete(managerId);
    if (room.size === 0) this.rooms.delete(code);
    return true;
  }

  get(code: string, managerId: string): VoiceMember | undefined {
    return this.rooms.get(code)?.get(managerId);
  }
}

/** Wire one socket's voice events. `seat()` is the gateway's verified identity for this socket. */
export function attachVoice(io: Server, socket: Socket, voice: VoiceRooms, seat: () => { code: string; managerId: string } | null) {
  const roster = (code: string) =>
    io.to(code).emit("voice:roster", {
      members: voice.members(code).map(({ managerId, sid, muted }) => ({ managerId, sid, muted })),
    });
  const mineIn = (code: string) => {
    const s = seat();
    if (!s || s.code !== code) { socket.emit("error", "must join before using voice"); return null; }
    return s;
  };
  // Where this socket currently sits in a call, so a disconnect can clean it up.
  let inCall: { code: string; managerId: string } | null = null;
  const dropOut = () => {
    if (inCall && voice.leave(inCall.code, inCall.managerId, socket.id)) roster(inCall.code);
    inCall = null;
  };

  socket.on("voice:join", (p: { code: string }) => {
    const s = mineIn(p.code);
    if (!s) return;
    if (inCall && inCall.code !== p.code) dropOut();
    const me = voice.join(p.code, s.managerId, socket.id);
    inCall = { code: p.code, managerId: s.managerId };
    // The newcomer calls everyone already here; existing members only answer — no offer glare.
    socket.emit("voice:welcome", {
      sid: me.sid,
      iceServers: iceServers(),
      peers: voice.members(p.code).filter((m) => m.managerId !== s.managerId).map(({ managerId, sid, muted }) => ({ managerId, sid, muted })),
    });
    roster(p.code);
  });

  socket.on("voice:signal", (p: { code: string; to: string; data: unknown }) => {
    const s = mineIn(p.code);
    if (!s) return;
    const from = voice.get(p.code, s.managerId);
    const to = voice.get(p.code, p.to);
    if (!from || from.socketId !== socket.id || !to) return; // both must be in this room's call
    io.to(to.socketId).emit("voice:signal", { from: s.managerId, sid: from.sid, data: p.data });
  });

  socket.on("voice:mute", (p: { code: string; muted: boolean }) => {
    const s = mineIn(p.code);
    if (!s) return;
    const m = voice.get(p.code, s.managerId);
    if (!m || m.socketId !== socket.id) return;
    m.muted = !!p.muted;
    roster(p.code);
  });

  /** Tell just this socket who's in the room's call (on entering the room, before joining voice). */
  const rosterTo = (code: string) =>
    socket.emit("voice:roster", {
      members: voice.members(code).map(({ managerId, sid, muted }) => ({ managerId, sid, muted })),
    });

  socket.on("voice:leave", () => dropOut());
  socket.on("leave", () => dropOut());
  socket.on("disconnect", () => dropOut());
  return { dropOut, rosterTo };
}
