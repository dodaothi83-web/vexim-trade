"use client";

import { useId, type ChangeEventHandler } from "react";

import { VIETNAM_PROVINCE_SUGGESTIONS } from "@/lib/vietnam-provinces";

/** Native suggestions keep province selection quick without blocking a custom sourcing region. */
export function RawMaterialRegionInput({ id, value, defaultValue, onChange, required = false, disabled = false }: {
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = `vietnam-provinces-${useId().replace(/:/g, "")}`;
  return <>
    <input
      id={id}
      type="text"
      name="raw_material_region"
      className="input"
      list={listId}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      required={required}
      disabled={disabled}
      maxLength={180}
      autoComplete="off"
      placeholder="Chọn tỉnh/thành hoặc nhập vùng cụ thể"
    />
    <datalist id={listId}>
      {VIETNAM_PROVINCE_SUGGESTIONS.map((province) => <option key={province} value={province} />)}
    </datalist>
  </>;
}
