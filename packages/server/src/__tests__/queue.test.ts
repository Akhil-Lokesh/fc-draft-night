import { test, expect } from "vitest";
import { Queue } from "../queue.js";

test("reducers for one room run strictly in enqueue order", async () => {
  const q = new Queue();
  const seen: number[] = [];
  const mk = (n: number) => (s: { v: number }) => { seen.push(n); return { state: { v: n }, events: [] }; };
  const states: { v: number }[] = [];
  q.setState("R", { v: 0 });
  const p1 = q.run("R", mk(1)).then(r => states.push(r.state));
  const p2 = q.run("R", mk(2)).then(r => states.push(r.state));
  const p3 = q.run("R", mk(3)).then(r => states.push(r.state));
  await Promise.all([p1, p2, p3]);
  expect(seen).toEqual([1, 2, 3]);
  expect(q.getState("R")).toEqual({ v: 3 });
});

test("a slower earlier reducer still blocks a faster later one from running out of order", async () => {
  const q = new Queue();
  q.setState("R", { v: 0 });
  const started: number[] = [];
  const finished: number[] = [];

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Reducer 1 is slow (40ms); reducer 2 is fast (0ms). If the queue were not
  // truly serialized (e.g. it just fired both immediately), 2 would finish
  // before 1. With correct serialization, 2 cannot even *start* until 1's
  // promise resolves, so finish order must be [1, 2] regardless of speed.
  const slow = async (s: { v: number }) => {
    started.push(1);
    await delay(40);
    finished.push(1);
    return { state: { v: s.v + 1 }, events: [] };
  };
  const fast = async (s: { v: number }) => {
    started.push(2);
    finished.push(2);
    return { state: { v: s.v + 1 }, events: [] };
  };

  const p1 = q.run("R", slow);
  const p2 = q.run("R", fast);

  const [r1, r2] = await Promise.all([p1, p2]);

  expect(started).toEqual([1, 2]);
  expect(finished).toEqual([1, 2]);
  expect(r1.state).toEqual({ v: 1 });
  expect(r2.state).toEqual({ v: 2 });
  expect(q.getState("R")).toEqual({ v: 2 });
});

test("different rooms are independent and do not serialize against each other", async () => {
  const q = new Queue();
  q.setState("A", { v: 0 });
  q.setState("B", { v: 0 });

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const order: string[] = [];

  const slowA = async (s: { v: number }) => {
    await delay(30);
    order.push("A");
    return { state: { v: s.v + 1 }, events: [] };
  };
  const fastB = async (s: { v: number }) => {
    order.push("B");
    return { state: { v: s.v + 1 }, events: [] };
  };

  const pA = q.run("A", slowA);
  const pB = q.run("B", fastB);
  await Promise.all([pA, pB]);

  // B (a different room) is not blocked by A's slow reducer.
  expect(order).toEqual(["B", "A"]);
});
