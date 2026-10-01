import { OVERCOMMIT_FINE } from "@fcdn/shared";
import { Brand, Flap } from "../ui/primitives.js";
import { CHALLENGE_CAP, QUOTE_CAP } from "../lib/board.js";

const LAWS: { title: string; body: React.ReactNode }[] = [
  { title: "Real squads", body: "Every manager takes a real club's real squad. Its total value is reserved; whatever's left of the budget is yours to spend." },
  { title: "Free agents", body: "Claim a pool player to open a 2-minute public listing. Anyone can jump in." },
  { title: "Challenges", body: "Go after a rival's player by bidding above his listed value. That starts a bidding war." },
  { title: "Quote cap", body: <>Each manager gets <b>{QUOTE_CAP} raises</b> per war. Spend them wisely.</> },
  { title: "Rival cap", body: <>You can challenge the same rival <b>{CHALLENGE_CAP} times</b> across the whole draft.</> },
  { title: "The clock", body: "A challenge gives the other side the full quote timer to answer. After that, every new bid resets the war to 2 minutes. No last-second sniping, no half-hour wars." },
  { title: "Overcommit", body: <>Win more than you can cover and it's a <b>{OVERCOMMIT_FINE}M fine</b>. The player goes to the next-best bidder or back to his old owner.</> },
  { title: "Locked in", body: "Win or successfully defend a player and he's locked for the season. No releasing him back." },
  { title: "In the black", body: "The auction can't end while anyone is over budget, even when the clock runs out. If your squad is worth more than your budget, release players until you're back at zero." },
  { title: "Giving up", body: "If the owner concedes a defence, the war ends on the spot. A challenger giving up just drops out." },
];

export function Landing({ onHost, onJoin }: { onHost: () => void; onJoin: () => void }) {
  return (
    <div className="page page-landing">
      <header className="hero">
        <h1 className="sr-only">FC Draft Night</h1>
        <div className="hero-brand rise" style={{ animationDelay: "60ms" }}>
          <Brand size="xl" />
          <p className="hero-tag"><span>Your club</span><i aria-hidden="true" /><span>Your budget</span><i aria-hidden="true" /><span>Your XI</span></p>
        </div>
        <div className="hero-actions rise" style={{ animationDelay: "180ms" }}>
          <button className="btn btn-flare btn-lg" onClick={onHost}>Host a draft</button>
          <button className="btn btn-chalk btn-lg" onClick={onJoin}>Join with a code</button>
        </div>
      </header>

      <div className="numbers rise" style={{ animationDelay: "240ms" }} aria-label="Key limits">
        <div className="number"><Flap size="lg">{QUOTE_CAP}</Flap><span>raises per war</span></div>
        <div className="number"><Flap size="lg">{CHALLENGE_CAP}</Flap><span>challenges per rival</span></div>
        <div className="number"><Flap size="lg" tone="hot">{OVERCOMMIT_FINE}M</Flap><span>overcommit fine</span></div>
      </div>

      <section className="laws rise" style={{ animationDelay: "300ms" }} aria-labelledby="laws-title">
        <h2 id="laws-title" className="laws-title">Laws of the Game</h2>
        <ol className="laws-list">
          {LAWS.map((l, i) => (
            <li key={l.title} className="law">
              <span className="law-no">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="law-name">{l.title}</div>
                <p className="law-body">{l.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
