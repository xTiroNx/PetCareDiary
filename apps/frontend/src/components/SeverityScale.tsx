import clsx from "clsx";
import { useState } from "react";
import { useI18n } from "../utils/i18n";

type SeverityScaleProps = {
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string) => void;
};

export function SeverityScale({ name = "severity", value, defaultValue = 1, onChange }: SeverityScaleProps) {
  const { t } = useI18n();
  const [internalValue, setInternalValue] = useState(String(value ?? defaultValue));
  const selected = String(value ?? internalValue);

  function choose(next: number) {
    const nextValue = String(next);
    setInternalValue(nextValue);
    onChange?.(nextValue);
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink dark:text-white">{t("severity")}</p>
          <p className="text-xs text-zinc-500">{t("severityHint")}</p>
        </div>
        <span className="shrink-0 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-bold text-mint">
          {selected}/5
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((item) => (
          <button
            key={item}
            type="button"
            className={clsx(
              "min-h-10 rounded-lg border text-sm font-extrabold transition active:scale-[0.98]",
              selected === String(item)
                ? "border-mint bg-mint text-white shadow-soft"
                : "border-zinc-200 bg-zinc-50 text-ink dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            )}
            onClick={() => choose(item)}
            aria-pressed={selected === String(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
