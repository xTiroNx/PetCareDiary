import clsx from "clsx";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, jsonBody } from "../api/client";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

type AiMode = "SUMMARY" | "VET_QUESTIONS" | "WHAT_TO_TRACK" | "GENERAL_HELP";
type AiPeriod = "7" | "14" | "30" | "90";
type AiResponse = {
  answer?: string;
  text?: string;
  disclaimer?: string;
  warnings?: string[];
};

const modes: AiMode[] = ["SUMMARY", "VET_QUESTIONS", "WHAT_TO_TRACK", "GENERAL_HELP"];

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function AiAssistantPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const accessStatus = useAppStore((state) => state.accessStatus);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const [mode, setMode] = useState<AiMode>("SUMMARY");
  const [period, setPeriod] = useState<AiPeriod>("7");
  const [question, setQuestion] = useState("");
  const hasAccess = isAdmin || accessStatus !== "expired";

  const ask = useMutation({
    mutationFn: () => api<AiResponse>("/api/ai/assistant", {
      method: "POST",
      body: jsonBody({
        petId: pet!.id,
        mode,
        question: mode === "GENERAL_HELP" ? question.trim() : undefined,
        period,
        timezone: getDeviceTimeZone(),
        locale: language
      })
    })
  });

  if (!isAdmin) return <Navigate to="/" replace />;
  if (!hasAccess) return <Navigate to="/paywall" replace />;

  const modeLabels: Record<AiMode, string> = {
    SUMMARY: t("aiSummary"),
    VET_QUESTIONS: t("aiVetQuestions"),
    WHAT_TO_TRACK: t("aiNextSteps"),
    GENERAL_HELP: t("aiGeneralHelp")
  };
  const answer = ask.data?.answer ?? ask.data?.text ?? "";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask.mutate();
  }

  return (
    <main className="space-y-4">
      <header className="panel bg-ink text-white dark:bg-zinc-900">
        <Bot className="mb-3 text-mint" size={32} />
        <h1 className="text-[30px] font-extrabold leading-tight">{t("aiAssistant")}</h1>
        <p className="mt-2 text-sm leading-6 text-white/70">{t("aiIntro")}</p>
      </header>

      <form className="panel space-y-3" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-2">
          {modes.map((item) => (
            <button
              className={clsx("btn min-h-12 px-2 text-xs", mode === item ? "btn-primary" : "btn-secondary")}
              key={item}
              type="button"
              onClick={() => setMode(item)}
            >
              {modeLabels[item]}
            </button>
          ))}
        </div>
        <label className="block text-xs font-semibold text-zinc-500">
          {t("aiPeriod")}
          <SelectField className="mt-1" value={period} onChange={(event) => setPeriod(event.target.value as AiPeriod)}>
            <option value="7">{t("days7")}</option>
            <option value="14">{t("days14")}</option>
            <option value="30">{t("days30")}</option>
            <option value="90">{t("days90")}</option>
          </SelectField>
        </label>
        {mode === "GENERAL_HELP" && (
          <textarea
            className="input min-h-28"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("aiQuestion")}
            required
          />
        )}
        <button className="btn btn-primary w-full" disabled={ask.isPending || (mode === "GENERAL_HELP" && !question.trim())}>
          <Send size={17} />{ask.isPending ? t("loading") : t("askAi")}
        </button>
        <RequestError error={ask.error} />
      </form>

      {answer && (
        <section className="panel space-y-3">
          <p className="section-title">{t("aiAnswer")}</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">{answer}</p>
          {ask.data?.warnings?.length ? (
            <ul className="grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              {ask.data.warnings.map((warning) => <li className="rounded-lg bg-coral/10 p-2" key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          <p className="rounded-lg bg-mint/10 p-3 text-xs font-semibold leading-5 text-zinc-600 dark:text-zinc-300">
            {ask.data?.disclaimer || t("aiDisclaimer")}
          </p>
        </section>
      )}

      <MedicalDisclaimer />
    </main>
  );
}
