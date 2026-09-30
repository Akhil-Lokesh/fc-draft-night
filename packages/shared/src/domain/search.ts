/** Lowercase, accents and "ø/ß" folded away, so "mbappe" finds "Mbappé" and "odegaard" finds "Ødegaard". */
export function foldName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[øØ]/g, "o").replace(/ß/g, "ss").toLowerCase();
}

/**
 * Does a player's name match what someone typed into a search box?
 *
 * FC26 writes most names as an initial plus surname ("E. Haaland"), so people typing the name they
 * know ("erling haaland") would find nothing with a plain substring test. Each typed word must match
 * on its own, in any order:
 *  - a word of two or more letters matches if the name contains it ("belling", "haaland");
 *  - a lone letter ("e", "e.") is an initial and must be the name's initial;
 *  - a longer word that the name doesn't contain still matches when it starts with the name's initial
 *    ("erling" → "E."), as long as another word matched the rest — this tells namesakes apart
 *    (M. Haaland fails "erling haaland") without being able to see anyone's real first name.
 */
export function matchesName(name: string, query: string): boolean {
  const words = foldName(query).split(/[\s.]+/).filter(Boolean);
  if (words.length === 0) return true;
  const n = foldName(name);
  const nameWords = n.split(/[\s.]+/).filter(Boolean);
  const initial = /^[^\s.]\.(\s|$)/.test(n) ? n[0]! : null; // "e. haaland" → "e"; "jobe bellingham" → none

  let matched = 0;
  const unmatched: string[] = [];
  for (const w of words) {
    if (w.length === 1) {
      if (initial ? w === initial : nameWords.some((x) => x.startsWith(w))) matched++; else unmatched.push(w);
    } else if (n.includes(w)) matched++;
    else unmatched.push(w);
  }
  // A word the name doesn't contain can still be a first name behind the initial, but only when the
  // rest of the query matched something real (a surname) and the word starts with that initial.
  return unmatched.every((w) => initial !== null && matched > 0 && w.startsWith(initial));
}
