import type { ChangeEventHandler } from "react";

/** 購読は呼び出し元のform.Fieldで行い、この表示部には1項目だけ渡す。 */
export function FormInput({
  name,
  label,
  value,
  options,
  min,
  max,
  onChange,
  onBlur,
}: {
  name: string;
  label: string;
  value: string | number | undefined;
  options?: readonly { value: string | number; label: string; disabled?: boolean }[];
  min?: number;
  max?: number;
  onChange: ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
  onBlur: () => void;
}) {
  return (
    <label>
      {label}
      {options ? (
        <select name={name} value={value ?? "none"} onChange={onChange} onBlur={onBlur}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type="number"
          min={min}
          max={max}
          step="1"
          required
          value={typeof value === "number" && Number.isFinite(value) ? value : ""}
          onChange={onChange}
          onBlur={onBlur}
        />
      )}
    </label>
  );
}
