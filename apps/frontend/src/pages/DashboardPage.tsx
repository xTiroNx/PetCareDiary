import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarCheck, CheckCircle2, Circle, Droplets, FileText, HeartPulse, Pill, Scale, Utensils } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { AccessBadge } from "../components/AccessBadge";
import { AccessNotice } from "../components/AccessNotice";
import { VoiceCommand } from "../components/AdminVoiceCommand";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { PetAvatar } from "../components/PetAvatar";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

type OnboardingProgress = {
  hasPet: boolean;
  hasDiaryEntry: boolean;
  hasReminder: boolean;
};

export default function DashboardPage() {
  const { t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const [searchParams] = useSearchParams();
  const accessStatus = useAppStore((state) => state.accessStatus);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const hasActiveAccess = isAdmin || accessStatus !== "expired";
  const progress = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: () => api<OnboardingProgress>("/api/pets/onboarding-progress"),
    enabled: Boolean(pet)
  });
  if (!pet) return <Navigate to="/onboarding" replace />;
  const onboardingProgress = progress.data ?? (searchParams.get("welcome") === "1" ? {
    hasPet: true,
    hasDiaryEntry: false,
    hasReminder: false
  } : null);
  const completedSteps = onboardingProgress
    ? [onboardingProgress.hasPet, onboardingProgress.hasDiaryEntry, onboardingProgress.hasReminder].filter(Boolean).length
    : 3;
  const petMeta = [
    pet.type === "CAT" ? t("cat") : pet.type === "DOG" ? t("dog") : t("otherPet"),
    pet.weightKg ? `${pet.weightKg} kg` : null,
    pet.ageYears ? `${pet.ageYears} ${t("yearsUnit")}` : null
  ].filter(Boolean).join(" · ");

  return (
    <main className="space-y-4">
      <header className="panel bg-ink text-white dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PetAvatar pet={pet} size="xl" />
            <div className="min-w-0">
              <h1 className="break-words text-[32px] font-extrabold leading-none">{pet.name}</h1>
              <p className="mt-2 text-sm leading-5 text-white/70">{petMeta}</p>
            </div>
          </div>
          <div className="shrink-0">
            <AccessBadge />
          </div>
        </div>
      </header>
      <AccessNotice />
      {onboardingProgress && completedSteps < 3 ? (
        <section className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title">{t("firstDayTitle")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("firstDayProgress", { done: completedSteps })}</p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-mint">{completedSteps}/3</span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {onboardingProgress.hasPet ? <CheckCircle2 className="text-mint" size={19} /> : <Circle className="text-zinc-400" size={19} />}
              {t("firstDayPet")}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {onboardingProgress.hasDiaryEntry ? <CheckCircle2 className="text-mint" size={19} /> : <Circle className="text-zinc-400" size={19} />}
                {t("firstDayEntry")}
              </div>
              {!onboardingProgress.hasDiaryEntry ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Link className="btn btn-primary min-w-0 px-2 text-xs" to="/feeding"><Utensils size={15} />{t("feeding")}</Link>
                  <Link className="btn btn-secondary min-w-0 px-2 text-xs" to="/weight"><Scale size={15} />{t("weight")}</Link>
                  <Link className="btn btn-secondary min-w-0 px-2 text-xs" to="/symptoms"><HeartPulse size={15} />{t("symptom")}</Link>
                </div>
              ) : null}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {onboardingProgress.hasReminder ? <CheckCircle2 className="text-mint" size={19} /> : <Circle className="text-zinc-400" size={19} />}
                {t("firstDayReminder")}
              </div>
              {!onboardingProgress.hasReminder ? <Link className="btn btn-secondary mt-2 w-full" to={hasActiveAccess ? "/reminders" : "/paywall"}><CalendarCheck size={16} />{t("createReminder")}</Link> : null}
            </div>
          </div>
        </section>
      ) : null}
      <section className="panel p-3.5">
        <h2 className="section-title mb-3">{t("quickActions")}</h2>
        <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-3">
          <Link className="btn btn-primary quick-action" to="/feeding"><Utensils size={18} />{t("feeding")}</Link>
          <Link className="btn btn-secondary quick-action" to="/water"><Droplets size={18} />{t("water")}</Link>
          <Link className="btn btn-secondary quick-action" to="/medicines"><Pill size={18} />{t("medicine")}</Link>
          <Link className="btn btn-secondary quick-action" to="/symptoms"><HeartPulse size={18} />{t("symptom")}</Link>
          <Link className="btn btn-secondary quick-action" to="/weight"><Scale size={18} />{t("weight")}</Link>
          <Link className="btn btn-secondary quick-action" to="/vaccinations"><CalendarCheck size={18} />{t("vaccination")}</Link>
          <Link className="btn btn-secondary quick-action col-span-2 min-h-[50px] min-[900px]:col-span-1" to="/notes"><FileText size={18} />{t("otherNote")}</Link>
          {hasActiveAccess && <Link className="btn btn-secondary quick-action col-span-2 min-h-[50px] min-[900px]:col-span-1" to="/ai"><Bot size={18} />{t("aiAssistant")}</Link>}
        </div>
      </section>
      {hasActiveAccess && <VoiceCommand endpoint="/api/voice/command" />}
      {pet.healthNotes && <section className="panel"><h2 className="section-title">{t("healthFeatures")}</h2><p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{pet.healthNotes}</p></section>}
      <MedicalDisclaimer />
    </main>
  );
}
