import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { PetSwitcher } from "./PetSwitcher";
import { isTelegram } from "../utils/telegram";
import { useI18n } from "../utils/i18n";

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="app-shell">
      {!isTelegram() && import.meta.env.DEV && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] font-medium leading-5 text-amber-900 shadow-soft">
          {t("localMode")}
        </div>
      )}
      <PetSwitcher />
      {children}
      <BottomNav />
    </div>
  );
}
