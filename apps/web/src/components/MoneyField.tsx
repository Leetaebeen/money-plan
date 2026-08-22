import { formatWonInput, normalizeWonInput } from "../domain/plan-form";

interface MoneyFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  autoFocus,
}: MoneyFieldProps) {
  const helpId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <div className="field__label-row">
        <label htmlFor={id}>{label}</label>
        {value === "" ? (
          <button className="field__zero" type="button" onClick={() => onChange("0")}>
            없음 · 0원
          </button>
        ) : null}
      </div>
      {hint ? <p className="field__hint" id={helpId}>{hint}</p> : null}
      <div className="money-input">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={formatWonInput(value)}
          onChange={(event) => onChange(normalizeWonInput(event.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          placeholder="0"
        />
        <span aria-hidden="true">원</span>
      </div>
      {error ? <p className="field__error" id={errorId}>{error}</p> : null}
    </div>
  );
}
