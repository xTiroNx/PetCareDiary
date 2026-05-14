import { useEffect, useMemo, useState } from "react";
import { localDateInputValue } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";

type DateFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
  allowEmpty?: boolean;
};

export function DateField({ name, value, defaultValue, onChange, required, label, className = "", allowEmpty = false }: DateFieldProps) {
  const { t } = useI18n();
  const initial = useMemo(() => value || defaultValue || (allowEmpty ? "" : localDateInputValue()), [allowEmpty, defaultValue, value]);
  const [dateValue, setDateValue] = useState(initial);

  useEffect(() => {
    if (!value) return;
    setDateValue(value);
  }, [value]);

  return (
    <label className={`block w-full min-w-0 text-xs font-semibold text-zinc-500 ${className}`}>
      {label ?? t("date")}
      <input
        className="input date-input mt-1"
        name={name}
        type="date"
        value={dateValue}
        required={required}
        onChange={(event) => {
          setDateValue(event.target.value);
          onChange?.(event.target.value);
        }}
      />
    </label>
  );
}
