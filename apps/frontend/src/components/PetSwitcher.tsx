import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";
import { telegramSelection } from "../utils/telegram";
import { SelectField } from "./SelectField";

export function PetSwitcher() {
  const { t } = useI18n();
  const location = useLocation();
  const pet = useAppStore((state) => state.pet);
  const pets = useAppStore((state) => state.pets);
  const setActivePet = useAppStore((state) => state.setActivePet);

  if (!pets.length || location.pathname === "/onboarding") return null;

  return (
    <div className="mb-3 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t("activePet")}</p>
        <SelectField
          className="min-h-10 py-2 text-sm"
          value={pet?.id ?? ""}
          onChange={(event) => {
            telegramSelection();
            setActivePet(event.target.value);
          }}
        >
          {pets.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </SelectField>
      </div>
      <Link className="btn btn-secondary h-10 w-10 shrink-0 p-0" aria-label={t("addPet")} title={t("addPet")} to="/onboarding?new=1">
        <Plus size={18} />
      </Link>
    </div>
  );
}
