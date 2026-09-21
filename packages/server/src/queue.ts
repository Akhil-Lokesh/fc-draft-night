export type Reducer<S> = (
  s: S,
) => { state: S; events: unknown[] } | Promise<{ state: S; events: unknown[] }>;

export class Queue<S = any> {
  private states = new Map<string, S>();
  private tails = new Map<string, Promise<unknown>>();

  setState(code: string, s: S) { this.states.set(code, s); }
  getState(code: string): S | undefined { return this.states.get(code); }

  run(code: string, reducer: Reducer<S>): Promise<{ state: S; events: unknown[] }> {
    const prev = this.tails.get(code) ?? Promise.resolve();
    const next = prev.then(async () => {
      const cur = this.states.get(code)!;
      const out = await reducer(cur);
      this.states.set(code, out.state);
      return out;
    });
    // keep the chain alive even if a reducer throws
    this.tails.set(code, next.catch(() => {}));
    return next;
  }
}
