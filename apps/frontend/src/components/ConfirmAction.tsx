import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "../utils/i18n";
import { telegramConfirm, telegramImpact, telegramSelection } from "../utils/telegram";

type ConfirmActionProps = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  className: string;
  ariaLabel: string;
  children: ReactNode;
  onConfirm: () => void;
};

export function ConfirmAction({ title, message, confirmLabel, cancelLabel, disabled, className, ariaLabel, children, onConfirm }: ConfirmActionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const dialogTitle = title ?? t("confirmDeleteTitle");
  const dialogMessage = message ?? t("confirmDeleteText");

  async function openConfirm() {
    telegramSelection();
    const nativeConfirmed = await telegramConfirm(`${dialogTitle}\n\n${dialogMessage}`);
    if (nativeConfirmed === true) {
      telegramImpact("medium");
      onConfirm();
      return;
    }
    if (nativeConfirmed === false) return;
    setOpen(true);
  }

  return (
    <>
      <button className={className} aria-label={ariaLabel} title={ariaLabel} disabled={disabled} onClick={openConfirm}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 text-ink shadow-soft dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
            <div className="flex gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coral/15 text-coral">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold">{dialogTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{dialogMessage}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>{cancelLabel ?? t("cancel")}</button>
              <button
                className="btn bg-coral text-white hover:bg-coral/90"
                onClick={() => {
                  setOpen(false);
                  telegramImpact("medium");
                  onConfirm();
                }}
              >
                {confirmLabel ?? t("deleteRecord")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
