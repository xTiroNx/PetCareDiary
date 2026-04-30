import { useI18n } from "../utils/i18n";

export function LoadMore({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) {
  const { t } = useI18n();

  if (shown >= total) return null;

  return (
    <div className="grid gap-2 pt-1">
      <p className="text-center text-xs font-semibold text-zinc-500">
        {t("showingRecords", { shown, total })}
      </p>
      <button className="btn btn-muted w-full" onClick={onClick}>
        {t("showMore")}
      </button>
    </div>
  );
}
