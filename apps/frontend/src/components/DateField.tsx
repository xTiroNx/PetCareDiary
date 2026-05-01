import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate, localDateInputValue, normalizeDateText, parseDisplayDate } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";

type DateFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
};

export function DateField({ name, value, defaultValue, onChange, required, label, className = "" }: DateFieldProps) {
  const { t } = useI18n();
  const initial = useMemo(() => value || defaultValue || localDateInputValue(), [defaultValue, value]);
  const [dateValue, setDateValue] = useState(initial);
  const [textValue, setTextValue] = useState(formatDisplayDate(initial));

  useEffect(() => {
    if (!value) return;
    setDateValue(value);
    setTextValue(formatDisplayDate(value));
  }, [value]);

  function commit(nextText: string) {
    const parsed = parseDisplayDate(nextText);
    if (!parsed) {
      setTextValue(formatDisplayDate(dateValue));
      return;
    }

    setDateValue(parsed);
    setTextValue(formatDisplayDate(parsed));
    onChange?.(parsed);
  }

  return (
    <label className={`min-w-0 text-xs font-semibold text-zinc-500 ${className}`}>
      {label ?? t("date")}
      {name ? <input type="hidden" name={name} value={dateValue} /> : null}
      <input
        className="input date-input mt-1"
        inputMode="numeric"
        placeholder="dd.mm.yyyy"
        value={textValue}
        required={required}
        onBlur={() => commit(textValue)}
        onChange={(event) => {
          const nextText = normalizeDateText(event.target.value);
          setTextValue(nextText);
          const parsed = parseDisplayDate(nextText);
          if (parsed) {
            setDateValue(parsed);
            onChange?.(parsed);
          }
        }}
      />
    </label>
  );
}
