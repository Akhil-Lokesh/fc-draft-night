const DIACRITICS = /[̀-ͯ]/g;

// Letters that NFD doesn't decompose into base+combining-mark (so DIACRITICS above can't strip
// them) — fold each to its common ASCII approximation so a host typing "Odegaard" still matches
// the database's "Ødegaard".
const SPECIAL_LETTERS: [RegExp, string][] = [
  [/[øØ]/g, "o"], [/[æÆ]/g, "ae"], [/[œŒ]/g, "oe"], [/ß/g, "ss"],
  [/[ðÐ]/g, "d"], [/[þÞ]/g, "th"], [/[łŁ]/g, "l"], [/[đĐ]/g, "d"],
];

function foldSpecialLetters(s: string): string {
  return SPECIAL_LETTERS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), s);
}

/** Stable, URL/id-safe slug for a real-world club name (e.g. "Atlético Madrid" -> "atletico-madrid"). */
export function slugifyClub(name: string): string {
  return foldSpecialLetters(name.normalize("NFD").replace(DIACRITICS, ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Loose equality for matching a host-typed club/player name against the FC26 database —
 *  case/diacritic/whitespace-insensitive, nothing fuzzier than that. */
export function normalizeForMatch(s: string): string {
  return foldSpecialLetters(s.normalize("NFD").replace(DIACRITICS, "")).toLowerCase().trim().replace(/\s+/g, " ");
}
