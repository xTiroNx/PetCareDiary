import { useMutation } from "@tanstack/react-query";
import { Bot, ImageIcon, Send } from "lucide-react";
import { FormEvent, useState } from "react";
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

function sanitizeAiAnswer(value: string) {
  const withoutThinkBlocks = value.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  const withoutUnclosedThink = withoutThinkBlocks.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  const withoutOrphanClosingThink = withoutUnclosedThink.replace(/^[\s\S]*?<\/think>/gi, "");
  return withoutOrphanClosingThink.replace(/<\/?think\b[^>]*>/gi, "").trim();
}

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function aiAssistantErrorMessage(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "AI_ASSISTANT_LIMIT_REACHED") return t("aiErrorLimit");
  return error instanceof Error ? error.message : String(error);
}

export default function AiAssistantPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const [period, setPeriod] = useState<AiPeriod>("7");
  const [question, setQuestion] = useState("");
  const [includeImages, setIncludeImages] = useState(false);

  const ask = useMutation({
    mutationFn: () => api<AiResponse>("/api/ai/assistant", {
      method: "POST",
      body: jsonBody({
        petId: pet!.id,
        mode: "GENERAL_HELP" satisfies AiMode,
        question: question.trim(),
        period,
        timezone: getDeviceTimeZone(),
        locale: language,
        includeImages
      })
    })
  });

  const answer = sanitizeAiAnswer(ask.data?.answer ?? ask.data?.text ?? "");
  const askError = ask.error ? new Error(aiAssistantErrorMessage(ask.error, t)) : null;

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
        <label className="block text-xs font-semibold text-zinc-500">
          {t("aiPeriod")}
          <SelectField className="mt-1" value={period} onChange={(event) => setPeriod(event.target.value as AiPeriod)}>
            <option value="7">{t("days7")}</option>
            <option value="14">{t("days14")}</option>
            <option value="30">{t("days30")}</option>
            <option value="90">{t("days90")}</option>
          </SelectField>
        </label>
        <textarea
          className="input min-h-28"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("aiQuestion")}
          required
        />
        <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <input
            className="mt-1 h-5 w-5 accent-mint"
            type="checkbox"
            checked={includeImages}
            onChange={(event) => setIncludeImages(event.target.checked)}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold">
              <ImageIcon size={16} />{t("aiIncludeImages")}
            </span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t("aiIncludeImagesHint")}</span>
          </span>
        </label>
        <button className="btn btn-primary w-full" disabled={ask.isPending || !question.trim()}>
          <Send size={17} />{ask.isPending ? t("loading") : t("askAi")}
        </button>
        <RequestError error={askError} />
      </form>

      {answer && (
        <section className="panel space-y-3">
          <p className="section-title">{t("aiAnswer")}</p>
          <div className="max-h-[52vh] overflow-y-auto rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{answer}</p>
          </div>
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
