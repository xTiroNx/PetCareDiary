import { useMutation } from "@tanstack/react-query";
import { Check, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, jsonBody } from "../api/client";
import { useI18n } from "../utils/i18n";
import { telegramSelection, telegramSuccess } from "../utils/telegram";
import { RequestError } from "./RequestError";

type FeedbackResponse = {
  id: string;
  ok: true;
};

const maxFeedbackLength = 2000;

export function FeedbackForm() {
  const { t } = useI18n();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const trimmedMessage = message.trim();
  const isInvalid = !trimmedMessage || trimmedMessage.length > maxFeedbackLength;
  const feedback = useMutation({
    mutationFn: () => api<FeedbackResponse>("/api/feedback", {
      method: "POST",
      body: jsonBody({
        message: trimmedMessage,
        page: location.pathname.slice(0, 200)
      })
    }),
    onSuccess: () => {
      setMessage("");
      setSent(true);
      telegramSuccess();
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    telegramSelection();
    setSent(false);
    if (isInvalid) return;
    feedback.mutate();
  }

  return (
    <section id="feedback" className="panel scroll-mt-24 space-y-3">
      <div>
        <h2 className="section-title">{t("feedbackTitle")}</h2>
        <p className="muted mt-1">{t("feedbackHint")}</p>
      </div>
      <form className="grid gap-2" onSubmit={onSubmit}>
        <textarea
          className="input min-h-28"
          maxLength={maxFeedbackLength}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setSent(false);
          }}
          placeholder={t("feedbackPlaceholder")}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-zinc-500">{trimmedMessage.length}/{maxFeedbackLength}</span>
          <button className="btn btn-primary shrink-0 whitespace-nowrap px-3" type="submit" disabled={feedback.isPending || isInvalid}>
            <Send size={16} />{t("feedbackSend")}
          </button>
        </div>
      </form>
      {sent ? <p className="inline-flex items-center gap-2 text-sm font-bold text-mint"><Check size={16} />{t("feedbackSent")}</p> : null}
      <RequestError error={feedback.error} />
    </section>
  );
}
