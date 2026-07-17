import { formatAmount } from "../lib/format";

export function AmountInput({
  value,
  onChange,
  max,
  unit,
  maxLabel = "Balance",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number | null;
  unit: string;
  maxLabel?: string;
  disabled?: boolean;
}) {
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
          onClick={() => max !== null && onChange(String(max))}
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
          onClick={() => max !== null && onChange(String(max))}
        >
          {max === null ? "—" : `${formatAmount(max)} ${unit}`}
        </button>
      </div>
    </div>
  );
}
