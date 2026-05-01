import { useEffect, useMemo, useState } from "react";
import { localDateInputValue, localDateTimeInputValue, localTimeInputValue, mergeLocalDateTime } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";

type DateTimeFieldsProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
};

export function DateTimeFields({ name = "dateTime", value, defaultValue, onChange, required }: DateTimeFieldsProps) {
  const { t } = useI18n();
  const initial = useMemo(() => value || defaultValue || localDateTimeInputValue(), [defaultValue, value]);
  const [date, setDate] = useState(localDateInputValue(new Date(initial)));
  const [time, setTime] = useState(localTimeInputValue(new Date(initial)));
  const merged = mergeLocalDateTime(date, time);

  useEffect(() => {
    if (!value) return;
    const next = new Date(value);
    setDate(localDateInputValue(next));
    setTime(localTimeInputValue(next));
  }, [value]);

  function update(nextDate: string, nextTime: string) {
    const nextValue = mergeLocalDateTime(nextDate, nextTime);
    onChange?.(nextValue);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(92px,0.85fr)] gap-2">
      <input type="hidden" name={name} value={merged} />
      <label className="min-w-0 text-xs font-semibold text-zinc-500">
        {t("date")}
        <input
          className="input date-input mt-1"
          type="date"
          value={date}
          required={required}
          onChange={(event) => {
            setDate(event.target.value);
            update(event.target.value, time);
          }}
        />
      </label>
      <label className="min-w-0 text-xs font-semibold text-zinc-500">
        {t("time")}
        <input
          className="input date-input mt-1"
          type="time"
          value={time}
          required={required}
          onChange={(event) => {
            setTime(event.target.value);
            update(date, event.target.value);
          }}
        />
      </label>
    </div>
  );
}
