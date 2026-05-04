import { CalendarPlus, FileText, HeartPulse, Pill, Scale, Utensils } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { AccessBadge } from "../components/AccessBadge";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

export default function DashboardPage() {
  const { t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  if (!pet) return <Navigate to="/onboarding" replace />;
  const petMeta = [
    pet.type === "CAT" ? t("cat") : pet.type === "DOG" ? t("dog") : t("otherPet"),
    pet.weightKg ? `${pet.weightKg} kg` : null,
    pet.ageYears ? `${pet.ageYears} ${t("yearsUnit")}` : null
  ].filter(Boolean).join(" · ");

  return (
    <main className="space-y-4">
      <header className="panel bg-ink text-white dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-mint">PetCare Diary</p>
            <h1 className="mt-1 break-words text-[32px] font-extrabold leading-none">{pet.name}</h1>
            <p className="mt-2 text-sm leading-5 text-white/70">{petMeta}</p>
          </div>
          <div className="shrink-0">
            <AccessBadge />
          </div>
        </div>
      </header>
      <section className="panel p-3.5">
        <h2 className="section-title mb-3">{t("quickActions")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link className="btn btn-primary quick-action" to="/feeding"><Utensils size={18} />{t("feeding")}</Link>
          <Link className="btn btn-secondary quick-action" to="/medicines"><Pill size={18} />{t("medicine")}</Link>
          <Link className="btn btn-secondary quick-action" to="/symptoms"><HeartPulse size={18} />{t("symptom")}</Link>
          <Link className="btn btn-secondary quick-action" to="/weight"><Scale size={18} />{t("weight")}</Link>
          <Link className="btn btn-secondary quick-action col-span-2 min-h-[50px]" to="/notes"><FileText size={18} />{t("otherNote")}</Link>
        </div>
      </section>
      {pet.healthNotes && <section className="panel"><h2 className="section-title">{t("healthFeatures")}</h2><p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{pet.healthNotes}</p></section>}
      <Link className="btn btn-secondary w-full" to="/reminders"><CalendarPlus size={18} />{t("reminders")}</Link>
      <MedicalDisclaimer />
    </main>
  );
}
