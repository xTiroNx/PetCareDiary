import { AlertTriangle } from "lucide-react";
import { useI18n } from "../utils/i18n";

export function MedicalDisclaimer() {
  const { t } = useI18n();

  return (
    <aside className="rounded-lg border border-coral/25 bg-coral/10 px-3 py-2.5 text-ink dark:border-coral/40 dark:bg-coral/10 dark:text-zinc-50">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-coral text-white">
          <AlertTriangle size={12} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold leading-4">{t("importantNote")}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-zinc-700 dark:text-zinc-200">
            {t("disclaimer")}
          </p>
        </div>
      </div>
    </aside>
  );
}
