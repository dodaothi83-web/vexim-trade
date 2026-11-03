"use client";

import { useId, type ChangeEventHandler } from "react";

import { VIETNAM_PROVINCE_SUGGESTIONS } from "@/lib/vietnam-provinces";
import { productEditorMessages } from "@/lib/i18n/portal/product-editor";

/** Native suggestions keep province selection quick without blocking a custom sourcing region. */
export function RawMaterialRegionInput({ id, value, defaultValue, onChange, required = false, disabled = false,
  placeholder = productEditorMessages.vi.shared.regionPlaceholder }: {
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  disabled?: boolean;
  /** Cổng nhà cung cấp truyền câu tiếng Anh; CRM không truyền nên giữ tiếng Việt. */
  placeholder?: string;
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
      placeholder={placeholder}
    />
    <datalist id={listId}>
      {VIETNAM_PROVINCE_SUGGESTIONS.map((province) => <option key={province} value={province} />)}
    </datalist>
  </>;
}
