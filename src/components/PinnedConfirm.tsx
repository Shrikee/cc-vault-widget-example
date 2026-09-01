import type { ReactNode } from "react";

import type { ConfirmPin } from "../lib/confirmPin";
import type { PinStatus } from "../hooks/useConfirmPin";

// The confirm modal's body on a product whose exits are priced against the
// holder's entitlement — the pinned block a depositor reads before signing.
//
// Like the quote card, it renders a model and computes NOTHING. Every sentence
// in it, down to which of "(required)" and "(yours)" follows the spread, is
// assembled and tested in src/lib/confirmPin.ts; what is decided here is
// layout. That is what makes "what the modal shows is what is posted" checkable
// — the tile, the rows and the discount handed to the queue are all read off
// one object.
//
// `children` are the rows the PANEL owns rather than the pin: the request's
// validity and the address the shares are approved to. Neither is pinned to a
// block, and neither moves between the pin and the transaction.

export function PinnedConfirm({
  status,
  pin,
  notice,
  note,
  children,
}: {
  status: PinStatus;
  pin: ConfirmPin | null;
  // Why these figures are not the ones last looked at — a re-check that refused
  // to post and pinned again.
  notice: string | null;
  // What the panel wants said between the rows and the footer — the signing
  // steps. It goes ABOVE the footer because the footer is the last word by
  // design: it is the one sentence that promises nothing.
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {notice && <div className="notice notice--warning">{notice}</div>}

      {/* Reading. No figures at all rather than the panel's live ones: those
          were true at some other block, and a modal that mixed them would show
          a set of numbers that was never true together. */}
      {pin === null && (
        <p className="muted small">
          Pinning the share price, your balance and your ceiling to one block…
        </p>
      )}

      {/* A pin that could not be taken. The cause is named, and the footer
          replaces Confirm with Close. */}
      {pin?.kind === "cannot-pin" && (
        <div className="notice notice--danger">
          <strong>{pin.headline}</strong>
          <span>{pin.body}</span>
        </div>
      )}

      {pin?.kind === "pinned" && (
        <>
          <div className="pinned-tile">{pin.tile}</div>
          <div className="rows">
            {pin.rows.map((row) => (
              <div className="row" key={row.label}>
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
            {children}
          </div>
          {note}
          <p className="muted small">{pin.footer}</p>
        </>
      )}

      {/* The re-check is in flight: the figures above still stand, and nothing
          has been posted yet. */}
      {status === "confirming" && (
        <p className="muted small">Re-reading the share price before posting…</p>
      )}
    </>
  );
}
