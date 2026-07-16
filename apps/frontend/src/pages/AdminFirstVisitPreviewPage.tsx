import clsx from "clsx";
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Crown,
  HeartPulse,
  PawPrint,
  Scale,
  ShieldCheck,
  Sparkles,
  Utensils
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

type PreviewStage = "onboarding" | "first-entry" | "first-reminder" | "complete" | "expired";

const previewStages: Array<{ value: PreviewStage; label: string }> = [
  { value: "onboarding", label: "Создание питомца" },
  { value: "first-entry", label: "1/3" },
  { value: "first-reminder", label: "2/3" },
  { value: "complete", label: "3/3" },
  { value: "expired", label: "После trial" }
];

export default function AdminFirstVisitPreviewPage() {
  const { t } = useI18n();
  const isAdmin = useAppStore((state) => state.isAdmin);
  const [stage, setStage] = useState<PreviewStage>("onboarding");

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <main className="space-y-4">
      <header className="flex items-center gap-3">
        <Link className="icon-btn shrink-0" to="/admin" aria-label="Назад в админку" title="Назад в админку">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-bold text-mint">Админ-предпросмотр</p>
          <h1 className="page-title">Первый вход</h1>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Этап первого входа">
        {previewStages.map((item) => (
          <button
            className={clsx("btn min-h-9 shrink-0 px-3 text-xs", stage === item.value ? "btn-primary" : "btn-secondary")}
            key={item.value}
            type="button"
            role="tab"
            aria-selected={stage === item.value}
            onClick={() => setStage(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-mint/35 bg-mint/5 px-3 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        <ShieldCheck className="mr-2 inline text-mint" size={17} />
        Предпросмотр не изменяет питомцев, записи, напоминания или подписку.
      </div>

      {stage === "onboarding" ? <OnboardingPreview /> : null}
      {stage === "expired" ? <ExpiredPreview /> : null}
      {stage !== "onboarding" && stage !== "expired" ? <FirstDayPreview stage={stage} /> : null}
    </main>
  );
}

function OnboardingPreview() {
  const { t } = useI18n();

  return (
    <div className="space-y-4" aria-label="Предпросмотр создания питомца">
      <div>
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-mint text-white"><PawPrint /></div>
        <h2 className="page-title">PetCare Diary</h2>
        <p className="muted mt-1">{t("onboardingSubtitle")}</p>
      </div>
      <div className="panel space-y-3">
        <select className="input" defaultValue="CAT" disabled aria-label={t("pet")}>
          <option value="CAT">{t("cat")}</option>
        </select>
        <input className="input" value="Барсик" readOnly aria-label={t("petName")} />
        <input className="input" value="4.5" readOnly aria-label={t("weightKg")} />
        <input className="input" value="2" readOnly aria-label={t("ageYears")} />
        <textarea className="input min-h-24" value="" readOnly placeholder={t("healthNotes")} aria-label={t("healthNotes")} />
        <button className="btn btn-primary w-full" type="button" disabled>{t("startDiary")}</button>
      </div>
    </div>
  );
}

function FirstDayPreview({ stage }: { stage: Exclude<PreviewStage, "onboarding" | "expired"> }) {
  const { t } = useI18n();
  const hasDiaryEntry = stage === "first-reminder" || stage === "complete";
  const hasReminder = stage === "complete";
  const completedSteps = 1 + Number(hasDiaryEntry) + Number(hasReminder);

  return (
    <div className="space-y-4" aria-label={`Предпросмотр прогресса ${completedSteps} из 3`}>
      <section className="panel bg-ink text-white dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-mint/20 text-mint"><PawPrint size={30} /></div>
            <div className="min-w-0">
              <h2 className="break-words text-[32px] font-extrabold leading-none">Барсик</h2>
              <p className="mt-2 text-sm leading-5 text-white/70">{t("cat")} · 4.5 kg · 2 {t("yearsUnit")}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-bold text-mint">{t("trialDays", { days: 7 })}</span>
        </div>
      </section>

      {!hasReminder ? (
        <section className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title">{t("firstDayTitle")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("firstDayProgress", { done: completedSteps })}</p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-mint">{completedSteps}/3</span>
          </div>
          <div className="mt-3 space-y-3">
            <ProgressRow complete label={t("firstDayPet")} />
            <div>
              <ProgressRow complete={hasDiaryEntry} label={t("firstDayEntry")} />
              {!hasDiaryEntry ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button className="btn btn-primary min-w-0 px-2 text-xs" type="button" disabled><Utensils size={15} />{t("feeding")}</button>
                  <button className="btn btn-secondary min-w-0 px-2 text-xs" type="button" disabled><Scale size={15} />{t("weight")}</button>
                  <button className="btn btn-secondary min-w-0 px-2 text-xs" type="button" disabled><HeartPulse size={15} />{t("symptom")}</button>
                </div>
              ) : null}
            </div>
            <div>
              <ProgressRow complete={false} label={t("firstDayReminder")} />
              {hasDiaryEntry ? <button className="btn btn-secondary mt-2 w-full" type="button" disabled><CalendarCheck size={16} />{t("createReminder")}</button> : null}
            </div>
          </div>
        </section>
      ) : null}

      <QuickActions />
    </div>
  );
}

function ProgressRow({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {complete ? <CheckCircle2 className="text-mint" size={19} /> : <Circle className="text-zinc-400" size={19} />}
      {label}
    </div>
  );
}

function QuickActions() {
  const { t } = useI18n();
  return (
    <section className="panel p-3.5">
      <h2 className="section-title mb-3">{t("quickActions")}</h2>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" type="button" disabled><Utensils size={18} />{t("feeding")}</button>
        <button className="btn btn-secondary" type="button" disabled><HeartPulse size={18} />{t("symptom")}</button>
        <button className="btn btn-secondary" type="button" disabled><Scale size={18} />{t("weight")}</button>
        <button className="btn btn-secondary" type="button" disabled><CalendarCheck size={18} />{t("reminders")}</button>
      </div>
    </section>
  );
}

function ExpiredPreview() {
  const { t } = useI18n();
  return (
    <div className="space-y-4" aria-label="Предпросмотр экрана после trial">
      <section className="panel bg-ink text-white dark:bg-zinc-900">
        <Crown className="mb-3 text-coral" size={34} />
        <h2 className="text-[32px] font-extrabold leading-tight">{t("proAccess")}</h2>
        <p className="mt-2 text-sm leading-6 text-white/75">{t("proText")}</p>
      </section>
      <div className="grid gap-2">
        {[t("buyMonthly"), t("buySixMonths"), t("buyYearly")].map((label, index) => (
          <button className={index === 0 ? "btn btn-primary w-full" : "btn btn-secondary w-full"} type="button" disabled key={label}>
            <Sparkles size={18} />{label}
          </button>
        ))}
      </div>
    </div>
  );
}
