"use client";

import {
  NativeSelect,
  NativeSelectOption,
} from "@watchtower/ui/components/native-select";

import { RANGE_PRESETS, type RangeKey } from "@/lib/range";

export function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value as RangeKey)}
      className="w-44"
    >
      {RANGE_PRESETS.map((p) => (
        <NativeSelectOption key={p.key} value={p.key}>
          {p.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
