import manifest from "./crests.json";

/** Real club crests for the top 100 FC26 clubs (by squad value), fetched by
 *  scripts/fetch-crests.mjs into public/crests/. Any other club keeps the lettered shield. */
const FILES = manifest as Record<string, string>;

// Keep in sync with crestKey in scripts/fetch-crests.mjs.
const GENERIC = new Set(["fc", "cf", "sc", "afc", "ac", "as", "sl", "sk", "rc", "cd", "ssc", "club", "de", "balompie", "calcio", "the", "vfl", "vfb", "04", "1"]);
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[øØ]/g, "o").replace(/ß/g, "ss")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
/** A club name with the generic bits ("FC", "AS", "CF"…) dropped, so "AS Roma", "Roma" and
 *  "roma" all find the same crest. */
export const crestKey = (s: string) => slug(s).split("-").filter((t) => t && !GENERIC.has(t)).join("-");

/** URL of a club's crest, trying its room id and then its display name — or null to draw the
 *  lettered shield instead. */
export function crestUrl(clubId: string, label?: string): string | null {
  for (const k of [clubId, crestKey(clubId), label && slug(label), label && crestKey(label)]) {
    if (k && FILES[k]) return `/crests/${FILES[k]}.png`;
  }
  return null;
}
