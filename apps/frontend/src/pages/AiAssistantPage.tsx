import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, Clock3, ImageIcon, RotateCcw, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, jsonBody } from "../api/client";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { languageLocale, useI18n } from "../utils/i18n";

type AiMode = "GENERAL_HELP";
type AiPeriod = "7" | "14" | "30" | "90";
type AiResponse = {
  answer?: string;
  text?: string;
  disclaimer?: string;
  warnings?: string[];
};
type AiPhoto = {
  id: string;
  fileName: string;
  source: string;
  url: string;
  createdAt: string;
};
type AiPhotosResponse = {
  items: AiPhoto[];
  limit: number;
  warnings?: string[];
};
type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
type AssistantExchange = {
  id: string;
  question: string;
  answer: string;
  warnings?: string[];
  createdAt: string;
};

const historyLimit = 8;

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

function aiHistoryKey(petId: string) {
  return `petcare-ai-history-v1:${petId}`;
}

function readHistory(petId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(aiHistoryKey(petId)) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AssistantExchange => {
      if (!item || typeof item !== "object") return false;
      const exchange = item as Partial<AssistantExchange>;
      return typeof exchange.id === "string" && typeof exchange.question === "string" &&
        typeof exchange.answer === "string" && typeof exchange.createdAt === "string";
    }).slice(-historyLimit);
  } catch {
    return [];
  }
}

function exchangeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [photoSelectionInitialized, setPhotoSelectionInitialized] = useState(false);
  const [history, setHistory] = useState<AssistantExchange[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [activeExchangeId, setActiveExchangeId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const timezone = getDeviceTimeZone();
  const activeExchange = history.find((exchange) => exchange.id === activeExchangeId) ?? null;
  const conversation = useMemo<ConversationMessage[]>(() => history.flatMap((exchange) => [
    { role: "user", content: exchange.question },
    { role: "assistant", content: exchange.answer }
  ]), [history]);

  const photoParams = new URLSearchParams({
    petId: pet?.id ?? "",
    period,
    timezone,
    locale: language
  });
  const photos = useQuery({
    queryKey: ["ai-photos", pet?.id, period, timezone, language],
    queryFn: () => api<AiPhotosResponse>(`/api/ai/photos?${photoParams.toString()}`),
    enabled: Boolean(pet) && includeImages,
    staleTime: 4 * 60_000,
    retry: false
  });

  useEffect(() => {
    if (!pet?.id) {
      setHistory([]);
      setHistoryReady(false);
      return;
    }
    setHistory(readHistory(pet.id));
    setHistoryReady(true);
    setActiveExchangeId(null);
    setShowAnswer(false);
  }, [pet?.id]);

  useEffect(() => {
    if (!historyReady || !pet?.id) return;
    try {
      localStorage.setItem(aiHistoryKey(pet.id), JSON.stringify(history.slice(-historyLimit)));
    } catch {
      // History persistence is optional in restricted WebViews.
    }
  }, [history, historyReady, pet?.id]);

  useEffect(() => {
    if (!includeImages || photoSelectionInitialized || !photos.data) return;
    setSelectedImageIds(photos.data.items.slice(0, photos.data.limit).map((photo) => photo.id));
    setPhotoSelectionInitialized(true);
  }, [includeImages, photoSelectionInitialized, photos.data]);

  useEffect(() => {
    setSelectedImageIds([]);
    setPhotoSelectionInitialized(false);
  }, [period, pet?.id]);

  const ask = useMutation({
    mutationFn: (input: { question: string; history: ConversationMessage[] }) => api<AiResponse>("/api/ai/assistant", {
      method: "POST",
      body: jsonBody({
        petId: pet!.id,
        mode: "GENERAL_HELP" satisfies AiMode,
        question: input.question,
        period,
        timezone,
        locale: language,
        includeImages: includeImages && selectedImageIds.length > 0,
        imageAttachmentIds: includeImages ? selectedImageIds : [],
        history: input.history.slice(-historyLimit * 2)
      })
    }),
    onSuccess: (data, input) => {
      const exchange: AssistantExchange = {
        id: exchangeId(),
        question: input.question,
        answer: sanitizeAiAnswer(data.answer ?? data.text ?? ""),
        warnings: data.warnings,
        createdAt: new Date().toISOString()
      };
      setHistory((current) => [...current, exchange].slice(-historyLimit));
      setActiveExchangeId(exchange.id);
      setQuestion("");
      setShowAnswer(true);
    }
  });

  const askError = ask.error ? new Error(aiAssistantErrorMessage(ask.error, t)) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    ask.mutate({ question: trimmedQuestion, history: conversation });
  }

  function toggleImages(checked: boolean) {
    setIncludeImages(checked);
    setSelectedImageIds([]);
    setPhotoSelectionInitialized(false);
  }

  function togglePhoto(photoId: string) {
    setSelectedImageIds((current) => {
      if (current.includes(photoId)) return current.filter((id) => id !== photoId);
      const limit = photos.data?.limit ?? 3;
      if (current.length >= limit) return current;
      return [...current, photoId];
    });
  }

  function openExchange(exchange: AssistantExchange) {
    setActiveExchangeId(exchange.id);
    setShowAnswer(true);
  }

  function clearHistory() {
    setHistory([]);
    setActiveExchangeId(null);
    setShowAnswer(false);
  }

  return (
    <main className="space-y-4">
      <header className="panel bg-ink text-white dark:bg-zinc-900">
        <Bot className="mb-3 text-mint" size={32} />
        <h1 className="text-[30px] font-extrabold leading-tight">{t("aiAssistant")}</h1>
        <p className="mt-2 text-sm leading-6 text-white/70">{t("aiIntro")}</p>
      </header>

      <div className="[perspective:1400px]">
        <div className={`grid transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${showAnswer ? "[transform:rotateY(180deg)]" : ""}`}>
          <form
            className={`panel col-start-1 row-start-1 min-h-[560px] space-y-3 [backface-visibility:hidden] ${showAnswer ? "pointer-events-none" : ""}`}
            onSubmit={onSubmit}
            aria-hidden={showAnswer}
            inert={showAnswer}
          >
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
              className="input min-h-32"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={history.length ? t("aiFollowUpQuestion") : t("aiQuestion")}
              required
            />
            <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                className="mt-1 h-5 w-5 accent-mint"
                type="checkbox"
                checked={includeImages}
                onChange={(event) => toggleImages(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold"><ImageIcon size={16} />{t("aiIncludeImages")}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t("aiIncludeImagesHint")}</span>
              </span>
            </label>

            {includeImages ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-500">
                  <span>{t("aiChoosePhotos")}</span>
                  <span>{selectedImageIds.length}/{photos.data?.limit ?? 3}</span>
                </div>
                {photos.isLoading ? <p className="text-xs text-zinc-500">{t("loading")}</p> : null}
                {photos.data?.items.length ? (
                  <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-0.5">
                    {photos.data.items.map((photo) => {
                      const selected = selectedImageIds.includes(photo.id);
                      const disabled = !selected && selectedImageIds.length >= photos.data.limit;
                      return (
                        <label className={`relative min-w-0 overflow-hidden rounded-lg border ${selected ? "border-mint ring-2 ring-mint/30" : "border-zinc-200 dark:border-zinc-800"} ${disabled ? "opacity-45" : "cursor-pointer"}`} key={photo.id}>
                          <input className="sr-only" type="checkbox" checked={selected} disabled={disabled} onChange={() => togglePhoto(photo.id)} />
                          <img className="aspect-square w-full object-cover" src={photo.url} alt={photo.fileName} />
                          {selected ? <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-mint text-white"><Check size={15} /></span> : null}
                          <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300" title={photo.source}>{photo.source}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {!photos.isLoading && photos.data && !photos.data.items.length ? <p className="text-xs text-zinc-500">{t("aiNoPhotos")}</p> : null}
                <RequestError error={photos.error} />
              </div>
            ) : null}

            <button className="btn btn-primary w-full" disabled={ask.isPending || !question.trim()}>
              <Send size={17} />{ask.isPending ? t("loading") : t("askAi")}
            </button>
            <RequestError error={askError} />
          </form>

          <section
            className={`panel col-start-1 row-start-1 min-h-[560px] [backface-visibility:hidden] [transform:rotateY(180deg)] ${showAnswer ? "" : "pointer-events-none"}`}
            aria-hidden={!showAnswer}
            inert={!showAnswer}
          >
            {activeExchange ? (
              <div className="flex min-h-[528px] flex-col">
                <div className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
                  <p className="text-[11px] font-bold uppercase text-mint">{t("aiAnswer")}</p>
                  <h2 className="mt-1 break-words text-lg font-extrabold leading-6 text-ink [overflow-wrap:anywhere] dark:text-white">{activeExchange.question}</h2>
                </div>
                <div className="min-h-0 flex-1 py-4">
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-200">{activeExchange.answer}</p>
                  {activeExchange.warnings?.length ? (
                    <ul className="mt-3 grid gap-1 text-xs text-coral">
                      {activeExchange.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : null}
                </div>
                <p className="mb-3 rounded-lg bg-mint/10 p-3 text-xs font-semibold leading-5 text-zinc-600 dark:text-zinc-300">{t("aiDisclaimer")}</p>
                <button className="btn btn-secondary w-full" type="button" onClick={() => setShowAnswer(false)}>
                  <ArrowLeft size={17} />{t("aiNewQuestion")}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {history.length ? (
        <section className="panel space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-title">{t("aiRecentQuestions")}</p>
              <p className="mt-1 text-xs text-zinc-500">{history.length}/{historyLimit}</p>
            </div>
            <button className="icon-btn" type="button" aria-label={t("aiClearConversation")} title={t("aiClearConversation")} onClick={clearHistory}>
              <RotateCcw size={17} />
            </button>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {[...history].reverse().map((exchange) => (
              <button className="flex w-full min-w-0 items-center gap-3 py-3 text-left" type="button" key={exchange.id} onClick={() => openExchange(exchange)}>
                <Clock3 className="shrink-0 text-mint" size={17} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink dark:text-white">{exchange.question}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{new Date(exchange.createdAt).toLocaleString(languageLocale(language), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <MedicalDisclaimer />
    </main>
  );
}
