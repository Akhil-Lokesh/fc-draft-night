import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { io, type Socket } from "socket.io-client";
import type { RoomState, SeedPlayer } from "@fcdn/shared";

/** Minimal transport surface so the store is testable without a live socket. */
export interface Transport {
  emit(ev: string, p?: any): void;
  on(ev: string, h: (p: any) => void): void;
}

export interface CreateOpts {
  totalBudget: number;
  quoteTimerMs?: number;
  squadSizeCap?: number | null;
  capacity?: number;
  rosterCsv?: string;
}

/** The server's answer to a peek, always naming the code it answers for. */
export type RoomPeek =
  | { code: string; found: false }
  | { code: string; found: true; capacity: number; takenClubs: string[]; managerCount: number; allClubs: { id: string; label: string }[] };

export interface JoinPayload {
  code: string;
  displayName: string;
  clubId: string;
  managerId?: string;
  /** Secret the server issued for this seat on first join — the only thing that can reattach it. */
  seatKey?: string;
  /** Secret handed to whoever created the room; joining with it makes you host. */
  hostKey?: string;
}

export interface CatalogPlayer {
  id: string;
  name: string;
  position: string;
  positionDetail?: string;
  altPositions?: string[];
  tags?: string[];
  value: number;
  club: string;
  clubId: string | null;
}

export interface UiState {
  room: RoomState | null;
  managerId: string | null;
  error: string | null;
  createdCode: string | null;
  catalogResults: CatalogPlayer[];
  seasonExport: { csv: string; filename: string } | null;
  roomPeek: RoomPeek | null;

  create(opts: CreateOpts): void;
  join(p: JoinPayload): void;
  peekRoom(code: string): void;
  start(): void;
  /** Claim an unowned pool player, or release one of your own — server infers which from ownership. */
  openListing(playerId: string): void;
  /** Go after a rival-owned player; amount is required and must exceed the player's listed value. */
  challenge(playerId: string, amount: number): void;
  bid(contestId: string, amount: number): void;
  /** Give up on a war you're involved in. Owner giving up ends it now; anyone else just drops out. */
  forfeit(contestId: string): void;
  /** Host-only: force-resolve every open contest right now and close the room. */
  endDraft(): void;
  search(q: { q?: string; position?: string; club?: string; limit?: number }): void;
  setPool(ids: string[]): void;
  exportSeason(): void;
  importSeason(csv: string, base: number, step: number): void;
  clearError(): void;
  /** Guest in the lobby: ask the host's permission to leave. */
  requestLeave(): void;
  /** Take back a leave request the host hasn't answered yet. */
  cancelLeave(): void;
  /** Host: let a guest go (removes them, freeing their club) or keep them in. */
  resolveLeave(managerId: string, allow: boolean): void;
  /** Leave the current room (e.g. "back to home" after a draft closes) — clears local room
   *  state and forgets the saved join, so a later reconnect doesn't silently rejoin it. */
  leave(): void;
}

const JOIN_KEY = "fcdn.join";
function persistJoin(p: JoinPayload) { try { localStorage.setItem(JOIN_KEY, JSON.stringify(p)); } catch { /* no storage */ } }
function loadJoin(): JoinPayload | null { try { const s = localStorage.getItem(JOIN_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
const HOST_KEY = "fcdn.hostKey";
function loadHostKey(): { code: string; key: string } | null { try { const s = localStorage.getItem(HOST_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function saveHostKey(v: { code: string; key: string } | null) { try { if (v) localStorage.setItem(HOST_KEY, JSON.stringify(v)); else localStorage.removeItem(HOST_KEY); } catch { /* no storage */ } }
export function clearJoin() { try { localStorage.removeItem(JOIN_KEY); } catch { /* no storage */ } }

export function makeStore(t: Transport) {
  // Remember the last join so a reconnect (HMR reload, backgrounded phone, network blip) can
  // silently rejoin the socket.io room — otherwise the new socket id isn't in the room and the
  // client stops receiving broadcasts (e.g. never sees the draft go live).
  let lastJoin: JoinPayload | null = loadJoin();
  // The room we just walked away from. The server may keep broadcasting it to this socket for a
  // moment; those stray states must not pull the client back in (that silently blocked the
  // "created -> join" redirect for a host who left a finished draft and created a new room).
  let leftCode: string | null = null;
  // The host key for the room this tab just created — attached to that room's first join only.
  // Kept in storage too: a refresh between "create" and "join" must not leave the room hostless.
  let hostKey: { code: string; key: string } | null = loadHostKey();
  // The code most recently peeked; a reply for any other code is stale and ignored.
  let peekedCode: string | null = null;

  const store = createStore<UiState>((set, get) => {
    const code = () => get().room?.code ?? get().createdCode ?? undefined;
    return {
      room: null,
      managerId: null,
      error: null,
      createdCode: null,
      catalogResults: [],
      seasonExport: null,
      roomPeek: null,

      create: (opts) => { leftCode = null; t.emit("create", opts); },
      join: (p) => {
        leftCode = null;
        // Re-entering the same room from the form (e.g. a fresh tab): bring this device's seat key.
        const prior = lastJoin?.code === p.code ? lastJoin : loadJoin()?.code === p.code ? loadJoin() : null;
        let payload = prior?.seatKey && !p.seatKey ? { ...p, seatKey: prior.seatKey } : p;
        if (hostKey?.code === p.code) payload = { ...payload, hostKey: hostKey.key };
        lastJoin = payload; persistJoin(payload); t.emit("join", payload);
      },
      peekRoom: (code) => { peekedCode = code; set({ roomPeek: null }); t.emit("peekRoom", { code }); },
      start: () => t.emit("start", { code: code() }),
      openListing: (playerId) => t.emit("openListing", { code: code(), playerId }),
      challenge: (playerId, amount) => t.emit("challenge", { code: code(), playerId, amount }),
      bid: (contestId, amount) => t.emit("bid", { code: code(), contestId, amount }),
      forfeit: (contestId) => t.emit("forfeit", { code: code(), contestId }),
      endDraft: () => t.emit("endDraft", { code: code() }),
      search: (q) => t.emit("searchCatalog", { ...q, code: code() }),
      setPool: (ids) => t.emit("setPool", { code: code(), ids }),
      exportSeason: () => t.emit("exportSeason", { code: code() }),
      importSeason: (csv, base, step) => t.emit("importSeason", { code: code(), csv, base, step }),
      clearError: () => set({ error: null }),
      requestLeave: () => t.emit("requestLeave", { code: code() }),
      cancelLeave: () => t.emit("cancelLeave", { code: code() }),
      resolveLeave: (managerId, allow) => t.emit("resolveLeave", { code: code(), managerId, allow }),
      leave: () => {
        const was = get().room?.code ?? lastJoin?.code ?? null;
        if (was) { leftCode = was; t.emit("leave", { code: was }); }
        lastJoin = null;
        clearJoin();
        set({ room: null, managerId: null, createdCode: null, roomPeek: null });
      },
    };
  });

  // On every (re)connection, if we've joined before, rejoin so the fresh socket is back in the
  // room and re-synced. On the initial page load this also resumes an in-progress draft.
  t.on("connect", () => {
    if (!lastJoin) return;
    const managerId = lastJoin.managerId ?? savedManagerId() ?? undefined;
    t.emit("join", managerId ? { ...lastJoin, managerId } : lastJoin);
  });
  t.on("state", (room: RoomState) => {
    if (leftCode && room.code === leftCode) return;
    store.setState({ room });
  });
  t.on("created", ({ code, hostKey: key }: { code: string; hostKey?: string }) => {
    if (key) { hostKey = { code, key }; saveHostKey(hostKey); }
    store.setState({ createdCode: code });
  });
  t.on("joined", ({ managerId, seatKey }: { managerId: string; seatKey?: string }) => {
    store.setState({ managerId });
    if (lastJoin && seatKey) lastJoin = { ...lastJoin, seatKey };
    // Host key is single-use; the seat key carries identity from here on.
    if (lastJoin?.hostKey) { const { hostKey: _used, ...rest } = lastJoin; lastJoin = rest; }
    if (hostKey && lastJoin?.code === hostKey.code) { hostKey = null; saveHostKey(null); }
    // Remember the assigned managerId in-memory (and in storage) so a later reconnect rejoins
    // as the SAME manager, not as a new one. In-memory is the source of truth — storage may be
    // absent (SSR, private mode, jsdom).
    if (lastJoin) { lastJoin = { ...lastJoin, managerId }; persistJoin(lastJoin); }
    try { localStorage.setItem("fcdn.managerId", managerId); } catch { /* SSR / no storage */ }
  });
  t.on("error", (message: string) => {
    if (/no such room/i.test(message)) { lastJoin = null; clearJoin(); } // stale room — don't loop on rejoin
    store.setState({ error: message });
  });
  t.on("catalogResults", (results: SeedPlayer[]) =>
    store.setState({ catalogResults: results as unknown as CatalogPlayer[] }));
  t.on("roomPeek", (peek: RoomPeek) => { if (peek.code === peekedCode) store.setState({ roomPeek: peek }); });
  t.on("seasonExport", (payload: { csv: string; filename: string }) =>
    store.setState({ seasonExport: payload }));

  return store;
}

/** Real socket.io transport. Connection is deferred (autoConnect:false) so the caller
 *  controls lifecycle via socket.connect()/disconnect() inside an effect. */
export function connect(url: string): Socket {
  return io(url, { transports: ["websocket"], autoConnect: false });
}

export type UiStore = ReturnType<typeof makeStore>;

/** React hook over a vanilla store. */
export function useUi<T>(store: UiStore, selector: (s: UiState) => T): T {
  return useStore(store, selector);
}

export function savedManagerId(): string | null {
  try { return localStorage.getItem("fcdn.managerId"); } catch { return null; }
}
