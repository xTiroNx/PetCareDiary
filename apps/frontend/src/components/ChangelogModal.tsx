import { Gift, MessageCircle, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../utils/i18n";
import { telegramSelection } from "../utils/telegram";

export const changelogSeenKey = "petcare-changelog-seen-v2026-05-18-promo-feedback";
export const openChangelogEvent = "petcare-open-changelog";

type ChangelogModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const updateItems = [
    t("changelogItemHealthActions"),
    t("changelogItemPhotoAttachments"),
    t("changelogItemPetAvatars"),
    t("changelogItemAiPhotos"),
    t("changelogPlanAi"),
    t("changelogItemStt"),
    t("changelogItemStability"),
    t("changelogItemUx")
  ];
  const plannedItems = [
    t("changelogPlanReports")
  ];

  if (!open) return null;

  function close() {
    telegramSelection();
    onClose();
  }

  function openOffer() {
    telegramSelection();
    onClose();
    navigate("/paywall");
  }

  function openFeedback() {
    telegramSelection();
    onClose();
    navigate("/profile#feedback");
    window.setTimeout(() => {
      document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-[calc(0.75rem+env(safe-area-inset-top)+env(safe-area-inset-bottom))]">
      <section className="panel max-h-[calc(100vh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border-mint/30 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-sm font-extrabold text-mint"><Sparkles size={17} />{t("changelogTitle")}</p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight">{t("changelogWhatsNew")}</h2>
          </div>
          <button className="icon-btn shrink-0" type="button" aria-label={t("closeApp")} title={t("closeApp")} onClick={close}>
            <X size={17} />
          </button>
        </div>

        <div className="rounded-lg border border-coral/40 bg-coral/10 p-3">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold text-coral">
            <Gift size={17} />{t("changelogPromoTitle")}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-100">{t("changelogItemPromo")}</p>
          <button className="btn btn-primary mt-3 w-full whitespace-nowrap" type="button" onClick={openOffer}>
            {t("changelogPromoCta")}
          </button>
        </div>

        <div className="rounded-lg border border-mint/40 bg-mint/10 p-3">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold text-mint">
            <MessageCircle size={17} />{t("changelogFeedbackTitle")}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-100">{t("changelogItemFeedback")}</p>
          <button className="btn btn-secondary mt-3 w-full whitespace-nowrap" type="button" onClick={openFeedback}>
            {t("changelogFeedbackCta")}
          </button>
        </div>

        <ul className="grid gap-2.5 text-sm leading-5 text-zinc-700 dark:text-zinc-200">
          {updateItems.map((item) => (
            <li className="flex items-center gap-2.5 rounded-lg bg-mint/5 px-3 py-2" key={item}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="section-title">{t("changelogPlanned")}</p>
          <ul className="mt-2 grid gap-2.5 text-sm leading-5 text-zinc-700 dark:text-zinc-200">
            {plannedItems.map((item) => (
              <li className="flex items-center gap-2.5" key={item}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <button className="btn btn-primary w-full whitespace-nowrap" type="button" onClick={close}>{t("changelogGotIt")}</button>
        </div>
      </section>
    </div>
  );
}
