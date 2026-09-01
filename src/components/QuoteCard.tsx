import type { QuoteCard as Card } from "../lib/withdrawQuote";

// The withdraw panel's quote card — the callout between the amount box and the
// rows, on a product whose exits are priced against the holder's entitlement.
//
// It renders a model and computes NOTHING. Every sentence in it, down to the
// vest dates and the "(required)" on the spread row, is assembled and tested in
// src/lib/withdrawQuote.ts; what is decided here is layout, and only layout:
// the two widths of the proportion bar, the two tiles, the dots before the
// legend and the lot lines, and the button the clamp's offer fills.
//
// Which is also why the card carries four shapes rather than one. The question
// a depositor arrives with — "what do I get if I leave now?" — has four
// different answers on this product: a price, a refusal, "not yet", and
// nothing typed. Each is a different block, and none of them is a row.

export function QuoteCard({
  card,
  // Fills the amount box with the clamp's offer. The only control the card has.
  onUseOffer,
}: {
  card: Card;
  onUseOffer: (amount: string) => void;
}) {
  if (card.kind === "none") return null;

  // The lock, which is stage 1's own notice with the quote's explanation of
  // itself added: nothing to post, so nothing to quote.
  if (card.kind === "locked") {
    return (
      <div className="notice notice--warning">
        <strong>{card.headline}</strong>
        <span>{card.body}</span>
      </div>
    );
  }

  // The 1% clamp. Danger, because the post is refused — and never a bare
  // refusal: the cause is named, and so are the two remedies that exist.
  if (card.kind === "clamp") {
    const { offer, nextVest } = card;
    return (
      <div className="notice notice--danger">
        <strong>{card.headline}</strong>
        <span>{card.body}</span>
        {(offer || nextVest) && (
          <span className="quote__remedy">
            {offer && (
              <>
                <strong>{offer.text}</strong>{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => onUseOffer(offer.amount)}
                >
                  {offer.buttonLabel}
                </button>
                {nextVest ? " · " : null}
              </>
            )}
            {nextVest}
          </span>
        )}
      </div>
    );
  }

  const { bar, tiles, lots } = card;
  return (
    <div className="notice notice--accent quote">
      <strong>{card.headline}</strong>

      {/* The vested/unvested split as a shape, which two numbers cannot be. */}
      {bar && (
        <>
          <div className="quote__bar" aria-hidden>
            <div
              className="quote__bar-part quote__bar-part--vested"
              style={{ width: `${bar.vestedPercent}%` }}
            />
            <div
              className="quote__bar-part quote__bar-part--unvested"
              style={{ width: `${100 - bar.vestedPercent}%` }}
            />
          </div>
          <div className="quote__legend">
            <span>
              <i className="quote__dot quote__dot--vested" />
              {bar.vestedLegend}
            </span>
            <span aria-hidden className="quote__legend-sep">
              ·
            </span>
            <span>
              <i className="quote__dot quote__dot--unvested" />
              {bar.unvestedLegend}
            </span>
          </div>
        </>
      )}

      {/* What this exit pays, beside what the same shares fetch at the full
          share price — the comparison the whole card exists to make. */}
      <div className="quote__tiles">
        {[tiles.now, tiles.atFullSharePrice].map((tile, i) => (
          <div className="quote__tile" key={tile.label}>
            <span className="quote__tile-label">{tile.label}</span>
            <span
              className={`quote__tile-value ${i === 1 ? "quote__tile-value--dim" : ""}`}
            >
              {tile.value}
            </span>
            <span className="quote__tile-note">{tile.note}</span>
          </div>
        ))}
      </div>

      <span className="quote__say">{card.cap}</span>

      {lots.length > 0 && (
        <ul className="quote__lots">
          {lots.map((line, i) => (
            // Keyed positionally: the lines are in the order the amount
            // spends its lots and are never reordered.
            <li key={i}>
              <i className="quote__dot quote__dot--unvested" />
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
