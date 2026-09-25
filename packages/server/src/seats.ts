import { createHash, randomBytes } from "node:crypto";
import type { RoomState } from "@fcdn/shared";

/** A seat key is the secret that proves "I am this manager" on rejoin. Manager ids are
 *  deterministic (`m_<clubId>`) and display names are public, so neither can be trusted to
 *  reattach someone to a seat. The client keeps the raw key; the room only ever stores its hash,
 *  and the hashes are stripped from every state sent to clients. */
export function newSeatKey(): string {
  return randomBytes(24).toString("base64url");
}

export function hashSeatKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Which manager (if any) this raw key unlocks in the room. */
export function seatFor(s: RoomState, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const h = hashSeatKey(key);
  return Object.entries(s.seatKeys ?? {}).find(([id, stored]) => stored === h && s.managers[id])?.[0];
}

/** The room as clients may see it — everything except the seat-key and host-key hashes. */
export function publicState(s: RoomState): RoomState {
  const { seatKeys: _secret, hostKeyHash: _host, ...rest } = s;
  return rest;
}
