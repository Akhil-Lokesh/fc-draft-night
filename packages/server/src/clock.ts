export interface Clock {
  now(): number;
}

export class RealClock implements Clock {
  now() {
    return Date.now();
  }
}

export class FakeClock implements Clock {
  constructor(private t = 0) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
  set(ms: number) {
    this.t = ms;
  }
}
