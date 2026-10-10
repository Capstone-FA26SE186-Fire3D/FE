import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ops-input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("ops-input", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ops-input", className)} {...props} />;
}

export type FieldControlProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/**
 * Label + control + hint/error wiring. Pass a render function so the control receives the
 * generated id and aria attributes: <Field label="Tên">{(p) => <Input {...p} />}</Field>
 */
export function Field({ label, hint, error, required, className, children }: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return <div className={cn("ops-field", className)}>
    <label htmlFor={id} data-required={required ? "true" : undefined}>{label}</label>
    {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
    {hint && <span id={hintId} className="ops-field-hint">{hint}</span>}
    {error && <span id={errorId} className="ops-field-error" role="alert">{error}</span>}
  </div>;
}
