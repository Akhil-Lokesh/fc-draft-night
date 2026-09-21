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
}

export interface JoinPayload {
  code: string;
  displayName: string;
  clubId: string;
  managerId?: string;
}

export interface CatalogPlayer {
  id: string;
  name: string;
  position: string;
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

  create(opts: CreateOpts): void;
  join(p: JoinPayload): void;
  start(): void;
  /** Claim an unowned pool player, or release one of your own — server infers which from ownership. */
  openListing(playerId: string): void;
  /** Go after a rival-owned player; amount is required and must exceed the player's listed value. */
  challenge(playerId: string, amount: number): void;
  bid(contestId: string, amount: number): void;
  search(q: { q?: string; position?: string; club?: string; limit?: number }): void;
  setPool(ids: string[]): void;
  exportSeason(): void;
  importSeason(csv: string, base: number, step: number): void;
  clearError(): void;
}

export function makeStore(t: Transport) {
  const store = createStore<UiState>((set, get) => {
    const code = () => get().room?.code ?? get().createdCode ?? undefined;
    return {
      room: null,
      managerId: null,
      error: null,
      createdCode: null,
      catalogResults: [],
      seasonExport: null,

      create: (opts) => t.emit("create", opts),
      join: (p) => t.emit("join", p),
      start: () => t.emit("start", { code: code() }),
      openListing: (playerId) => t.emit("openListing", { code: code(), playerId }),
      challenge: (playerId, amount) => t.emit("challenge", { code: code(), playerId, amount }),
      bid: (contestId, amount) => t.emit("bid", { code: code(), contestId, amount }),
      search: (q) => t.emit("searchCatalog", q),
      setPool: (ids) => t.emit("setPool", { code: code(), ids }),
      exportSeason: () => t.emit("exportSeason", { code: code() }),
      importSeason: (csv, base, step) => t.emit("importSeason", { code: code(), csv, base, step }),
      clearError: () => set({ error: null }),
    };
  });

  t.on("state", (room: RoomState) => store.setState({ room }));
  t.on("created", ({ code }: { code: string }) => store.setState({ createdCode: code }));
  t.on("joined", ({ managerId }: { managerId: string }) => {
    store.setState({ managerId });
    try { localStorage.setItem("fcdn.managerId", managerId); } catch { /* SSR / no storage */ }
  });
  t.on("error", (message: string) => store.setState({ error: message }));
  t.on("catalogResults", (results: SeedPlayer[]) =>
    store.setState({ catalogResults: results as unknown as CatalogPlayer[] }));
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
