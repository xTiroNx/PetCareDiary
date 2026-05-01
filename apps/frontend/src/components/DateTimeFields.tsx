import { useEffect, useMemo, useState } from "react";
import { localDateInputValue, localDateTimeInputValue, localTimeInputValue, mergeLocalDateTime, normalizeTimeText, parseDisplayTime } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";
import { DateField } from "./DateField";

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
  const [timeText, setTimeText] = useState(localTimeInputValue(new Date(initial)));
  const merged = mergeLocalDateTime(date, time);

  useEffect(() => {
    if (!value) return;
    const next = new Date(value);
    setDate(localDateInputValue(next));
    setTime(localTimeInputValue(next));
    setTimeText(localTimeInputValue(next));
  }, [value]);

  function update(nextDate: string, nextTime: string) {
    const nextValue = mergeLocalDateTime(nextDate, nextTime);
    onChange?.(nextValue);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(92px,0.9fr)] gap-2">
      <input type="hidden" name={name} value={merged} />
      <DateField
        value={date}
        required={required}
        onChange={(nextDate) => {
          setDate(nextDate);
          update(nextDate, time);
        }}
      />
      <label className="min-w-0 text-xs font-semibold text-zinc-500">
        {t("time")}
        <input
          className="input date-input mt-1"
          inputMode="numeric"
          placeholder="hh:mm"
          value={timeText}
          required={required}
          onBlur={() => {
            const parsed = parseDisplayTime(timeText);
            if (!parsed) {
              setTimeText(time);
              return;
            }
            setTime(parsed);
            setTimeText(parsed);
            update(date, parsed);
          }}
          onChange={(event) => {
            const nextText = normalizeTimeText(event.target.value);
            setTimeText(nextText);
            const parsed = parseDisplayTime(nextText);
            if (parsed) {
              setTime(parsed);
              update(date, parsed);
            }
          }}
        />
      </label>
    </div>
  );
}
