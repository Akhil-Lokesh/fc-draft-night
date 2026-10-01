import { useCallback, useEffect, useState } from "react";

/** A manager's shortlist of lots (contest ids) on the block, kept in this browser only, per room and
 *  per seat, so a host playing several seats in a test room gets a separate list for each. */
const keyFor = (code: string, myId: string) => `fcdn:shortlist:${code}:${myId}`;

function load(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function useShortlist(code: string, myId: string): { ids: ReadonlySet<string>; toggle: (contestId: string) => void } {
  const key = keyFor(code, myId);
  const [ids, setIds] = useState<Set<string>>(() => load(key));
  useEffect(() => setIds(load(key)), [key]); // a seat switch in a test room swaps lists

  const toggle = useCallback((contestId: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(contestId)) next.delete(contestId); else next.add(contestId);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* no storage: still works for this visit */ }
      return next;
    });
  }, [key]);

  return { ids, toggle };
}
