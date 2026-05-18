import { CheckCircle2 } from "lucide-react";
import { useI18n } from "../utils/i18n";

type SuccessFlashProps = {
  show: boolean;
};

export function SuccessFlash({ show }: SuccessFlashProps) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div className="success-flash" role="status" aria-live="polite">
      <CheckCircle2 size={17} />
      {t("recordSaved")}
    </div>
  );
}
