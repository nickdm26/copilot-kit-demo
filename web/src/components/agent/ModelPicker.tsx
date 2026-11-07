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
}

export function ModelPicker({
  models,
  value,
  onChange,
  compact,
  className,
  ...selectProps
}: ModelPickerProps) {
  return (
    <div className={cx("relative", compact && "max-w-[130px]", className)}>
      <label className="sr-only">Model</label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Model"
        {...selectProps}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {compact ? m.shortName : `${m.name} · ${m.provider}`}
          </option>
        ))}
      </Select>
    </div>
  );
}
