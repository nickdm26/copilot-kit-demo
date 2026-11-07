import { Select } from "../ui/Select";
import { cx } from "../ui/cx";
import type { SelectHTMLAttributes } from "react";

export interface ModelOption {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  speed?: "Fast" | "Balanced" | "Smart";
}

export interface ModelPickerProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
  /** Option text. Default: "{name} · {provider}", or the short name when compact. */
  optionLabel?: (m: ModelOption) => string;
}

export function ModelPicker({
  models,
  value,
  onChange,
  compact,
  optionLabel,
  className,
  ...selectProps
}: ModelPickerProps) {
  return (
    <div className={cx("relative", compact && "max-w-[130px]", className)}>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Model"
        className="w-full truncate"
        {...selectProps}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {optionLabel ? optionLabel(m) : compact ? m.shortName : `${m.name} · ${m.provider}`}
          </option>
        ))}
      </Select>
    </div>
  );
}
