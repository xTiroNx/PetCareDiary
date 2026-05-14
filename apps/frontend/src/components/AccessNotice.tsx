import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { languageLocale, useI18n } from "../utils/i18n";

const soonThresholdDays = 3;

function daysUntil(value: string | null) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function AccessNotice() {
  const { language, t } = useI18n();
  const status = useAppStore((state) => state.accessStatus);
  const endsAt = useAppStore((state) => state.accessEndsAt);
  const daysLeft = daysUntil(endsAt);

  if (status === "expired" || status === "admin" || status === "lifetime" || daysLeft === null || daysLeft > soonThresholdDays) {
    return null;
  }

  const dateLabel = new Date(endsAt!).toLocaleDateString(languageLocale(language));
  const isTrial = status === "trial";

  return (
    <section className="panel flex items-start gap-3 border-mint/30 bg-mint/5">
      {isTrial ? <AlertCircle className="mt-0.5 shrink-0 text-coral" size={20} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={20} />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{isTrial ? t("trialEndingSoon") : t("paidEndingSoon")}</p>
        <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{t("accessActiveUntil", { date: dateLabel })}</p>
        <Link className="mt-2 inline-flex text-sm font-bold text-mint" to="/paywall">{t("manageAccess")}</Link>
      </div>
    </section>
  );
}
