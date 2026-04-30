import { Crown, Timer } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

export function AccessBadge() {
  const { t } = useI18n();
  const status = useAppStore((state) => state.accessStatus);
  const endsAt = useAppStore((state) => state.accessEndsAt);
  const daysLeft = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)) : null;
  const label = status === "admin" ? t("adminAccess") : status === "lifetime" ? t("lifetime") : status === "active_monthly" ? t("monthlyActive") : status === "trial" ? t("trialDays", { days: daysLeft ?? 0 }) : t("expired");

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-2 text-xs font-bold leading-tight text-ink shadow-soft dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50">
      {status === "admin" || status === "lifetime" ? <Crown size={15} className="text-coral" /> : <Timer size={15} className="text-mint" />}
      <span className="min-w-0">{label}</span>
    </div>
  );
}
