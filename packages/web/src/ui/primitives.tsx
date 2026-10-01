import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { crestUrl } from "../lib/crests.js";
import { clubColor, clubShort, useClubColor, useClubLabel, useClubNames } from "../lib/clubs.js";
import { money } from "../lib/format.js";

/** Wordmark. `size` scales the whole lockup; the visible text is decorative, the accessible
 *  name lives on the heading around it where one is needed. */
export function Brand({ size = "md", tagline }: { size?: "sm" | "md" | "xl"; tagline?: string }) {
  return (
    <div className={`brand brand-${size}`}>
      <span className="brand-fc" aria-hidden="true">FC</span>
      <span className="brand-words">
        <span className="brand-word">Draft Night</span>
        {tagline && <span className="brand-tag">{tagline}</span>}
      </span>
    </div>
  );
}

/** Club colours exposed as CSS vars so any element can pick them up. */
export function clubVars(clubId: string): CSSProperties {
  return colorVars(clubColor(clubId));
}

const colorVars = ({ color, ink }: { color: string; ink: string }) =>
  ({ "--club": color, "--club-ink": ink }) as CSSProperties;

/** clubVars, but in the colour this room actually gave the club's manager — use this anywhere
 *  inside a room so every screen agrees on who is which colour. */
export function useClubVars() {
  const colorOf = useClubColor();
  return (clubId: string) => colorVars(colorOf(clubId));
}

/** The club's real crest when we have one (top FC26 clubs, see lib/crests), otherwise a
 *  shield-shaped monogram in the club's team colour. */
export function Crest({ clubId, size = 28 }: { clubId: string; size?: number }) {
  const names = useClubNames();
  const clubVars = useClubVars();
  const url = crestUrl(clubId, names[clubId]);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // Real crests are round/square and fill less of their box than the tall monogram shield,
    // so they get a larger box to read at the same visual weight.
    const px = Math.round(size * 1.35);
    return (
      <img className="crest-img" src={url} alt="" aria-hidden="true" width={px} height={px}
        loading="lazy" decoding="async" onError={() => setBroken(true)} />
    );
  }
  return (
    <span className="crest" style={{ ...clubVars(clubId), width: size, height: size * 1.12, fontSize: size * 0.34 }} aria-hidden="true">
      {clubShort(clubId, names)}
    </span>
  );
}

/** "Crest  Manager · Club" inline tag. */
export function ClubTag({ clubId, name, you, showClub = true }: { clubId: string; name: string; you?: boolean; showClub?: boolean }) {
  const label = useClubLabel();
  const clubVars = useClubVars();
  return (
    <span className="club-tag" style={clubVars(clubId)}>
      <Crest clubId={clubId} size={18} />
      <span className="club-tag-name">{name}{you ? " (you)" : ""}</span>
      {showClub && <span className="club-tag-club">{label(clubId)}</span>}
    </span>
  );
}

/** Split-flap scoreboard readout — one text node so it stays selectable and searchable,
 *  the hinge and cells are pure CSS. */
export function Flap({ children, tone, size = "md", label }: { children: ReactNode; tone?: "hot" | "win" | "dim"; size?: "sm" | "md" | "lg" | "xl"; label?: string }) {
  return (
    <span className={`flap flap-${size} ${tone ? `flap-${tone}` : ""}`} aria-label={label}>
      {children}
    </span>
  );
}

export function Money({ n, className = "" }: { n: number; className?: string }) {
  // The euro sign is drawn by CSS before the number, so a minus is its own span that CSS puts in front: "−€195.7M".
  const neg = n < 0 && Math.round(Math.abs(n) * 10) > 0;
  return (
    <span className={`money ${neg ? "is-neg" : ""} ${className}`}>
      {neg && <span className="money-sign">{"\u2212"}</span>}
      {money(Math.abs(n))}
    </span>
  );
}

export function Pos({ children }: { children: ReactNode }) {
  return <span className="pos">{children}</span>;
}

export function Section({ title, aside, children, className = "", id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const titleId = useId();
  return (
    <section className={`sheet ${className}`} id={id} aria-labelledby={titleId}>
      <header className="sheet-head">
        <h2 className="sheet-title" id={titleId}>{title}</h2>
        {aside && <div className="sheet-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
