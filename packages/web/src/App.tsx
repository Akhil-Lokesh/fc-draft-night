export function App() {
  return (
    <div className="app-shell">
      <header style={{ paddingTop: 48, textAlign: "center" }} className="rise">
        <h1 className="sr-only">FC Draft Night</h1>
        <div className="eyebrow">Live Transfer-Market Draft</div>
        <div className="brand" aria-hidden="true" style={{ justifyContent: "center", marginTop: 14 }}>
          <span className="fc">FC</span>
          <span className="brand-word">Draft Night</span>
        </div>
        <p className="muted" style={{ maxWidth: 320, margin: "18px auto 0", lineHeight: 1.5 }}>
          Five managers. One shared budget. Bid, challenge and poach your way to
          the best squad before kickoff.
        </p>
      </header>
    </div>
  );
}
