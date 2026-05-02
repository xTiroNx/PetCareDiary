import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import clsx from "clsx";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ className, children, ...props }: SelectFieldProps) {
  return (
    <div className={clsx("relative min-w-0", className)}>
      <select {...props} className={clsx("input appearance-none pr-11", className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
    </div>
  );
}
