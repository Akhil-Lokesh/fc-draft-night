import { applyCommand, type RoomState } from "@fcdn/shared";
import type { RoomStore } from "./rooms.js";
import type { Clock } from "./clock.js";

export class Ticker {
  private handle: ReturnType<typeof setInterval> | null = null;
  constructor(private store: RoomStore, private clock: Clock, private onChange: (s: RoomState) => void) {}

  async tickOnce(code: string) {
    const state = await this.store.run(code, (s) => applyCommand(s, { type: "Tick", now: this.clock.now() }));
    this.onChange(state);
  }
  start(codes: () => string[], everyMs = 1000) {
    this.handle = setInterval(() => { for (const c of codes()) void this.tickOnce(c); }, everyMs);
  }
  stop() { if (this.handle) clearInterval(this.handle); }
}
