import { formatAmount } from "../lib/format";

export function AmountInput({
  value,
  onChange,
  max,
  maxExact,
  unit,
  maxLabel = "Balance",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number | null;
  // What MAX should type, when the exact figure has more significant digits
  // than `max` can hold — a share balance is an 18-dp bigint and a double keeps
  // about fifteen digits, so "all" typed from the float can be a few wei short
  // of the balance, leaving dust that cannot be redeemed. Falls back to `max`
  // where there is no exact string (the deposit panel's token balance).
  maxExact?: string | null;
  unit: string;
  maxLabel?: string;
  disabled?: boolean;
}) {
  const fillMax = () => {
    if (maxExact) return onChange(maxExact);
    if (max !== null) onChange(String(max));
  };
  return (
    <div className="amount">
      <div className="amount__row">
        <input
          className="amount__input"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            // allow only numbers + single dot
            const v = e.target.value.replace(/[^0-9.]/g, "");
            if ((v.match(/\./g)?.length ?? 0) <= 1) onChange(v);
          }}
        />
        <div className="amount__unit">{unit}</div>
        <button
          type="button"
          className="amount__max"
          disabled={disabled || max === null || max <= 0}
          onClick={fillMax}
        >
          MAX
        </button>
      </div>
      <div className="amount__meta">
        {maxLabel}:{" "}
        <button
          type="button"
          className="linklike"
          disabled={disabled || max === null}
          onClick={fillMax}
        >
          {max === null ? "—" : `${formatAmount(max)} ${unit}`}
        </button>
      </div>
    </div>
  );
}
