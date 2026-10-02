"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  visibilityLabel: string;
};

export function PasswordInput({ visibilityLabel, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "Ẩn" : "Hiển thị";

  return <span className="password-input">
    <input {...inputProps} type={visible ? "text" : "password"} />
    <button type="button" className="password-toggle" aria-label={`${action} ${visibilityLabel}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
      {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
    </button>
  </span>;
}
