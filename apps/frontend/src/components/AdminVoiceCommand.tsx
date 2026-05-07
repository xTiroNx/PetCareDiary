import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Mic, RotateCcw, Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, apiFormData, jsonBody } from "../api/client";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputValue } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";
import { telegramError, telegramSelection, telegramSuccess } from "../utils/telegram";
import { DateTimeFields } from "./DateTimeFields";
import { RequestError } from "./RequestError";
import { SelectField } from "./SelectField";

type VoiceIntent = "create_reminder" | "create_medicine_entry" | "create_note" | "unknown";
type VoiceStatus = "idle" | "recording" | "uploading" | "result" | "error";
type VoiceResponse = {
  transcript: string;
  intent: VoiceIntent;
  confidence: number;
  needsConfirmation: true;
  draft: Record<string, unknown>;
  warnings: string[];
};
type ReminderDraft = { type: string; title: string; time: string; repeatRule: string; active: boolean };
type MedicineDraft = { medicineName: string; dosage: string; dateTime: string; taken: boolean; note: string };
type NoteDraft = { dateTime: string; note: string };
type EditableDraft = Record<string, string | boolean>;

const maxRecordingMs = 30000;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeDateTime(value: unknown) {
  if (typeof value !== "string") return localDateTimeInputValue();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? localDateTimeInputValue() : localDateTimeInputValue(date);
}

function normalizeDraft(intent: VoiceIntent, draft: Record<string, unknown>): EditableDraft {
  if (intent === "create_reminder") {
    return {
      type: asString(draft.type, "OTHER"),
      title: asString(draft.title),
      time: normalizeDateTime(draft.time),
      repeatRule: asString(draft.repeatRule),
      active: asBoolean(draft.active, true)
    };
  }
  if (intent === "create_medicine_entry") {
    return {
      medicineName: asString(draft.medicineName),
      dosage: asString(draft.dosage),
      dateTime: normalizeDateTime(draft.dateTime),
      taken: asBoolean(draft.taken),
      note: asString(draft.note)
    };
  }
  if (intent === "create_note") {
    return {
      dateTime: normalizeDateTime(draft.dateTime),
      note: asString(draft.note)
    };
  }
  return {};
}

function intentLabel(intent: VoiceIntent, t: ReturnType<typeof useI18n>["t"]) {
  if (intent === "create_reminder") return t("voiceIntentReminder");
  if (intent === "create_medicine_entry") return t("voiceIntentMedicine");
  if (intent === "create_note") return t("voiceIntentNote");
  return t("voiceIntentUnknown");
}

export function AdminVoiceCommand() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [result, setResult] = useState<VoiceResponse | null>(null);
  const [draft, setDraft] = useState<EditableDraft>({});
  const [localError, setLocalError] = useState<Error | null>(null);
  const [created, setCreated] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const shouldUploadRef = useRef(false);

  const voiceCommand = useMutation({
    mutationFn: (audio: Blob) => {
      if (!pet) throw new Error(t("noPet"));
      const formData = new FormData();
      formData.set("audio", audio, `voice-command.${audio.type.includes("mp4") ? "mp4" : "webm"}`);
      formData.set("petId", pet.id);
      formData.set("clientNow", new Date().toISOString());
      formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      formData.set("locale", language);
      return apiFormData<VoiceResponse>("/api/admin/voice/command", formData);
    },
    onSuccess: (response) => {
      setResult(response);
      setDraft(normalizeDraft(response.intent, response.draft ?? {}));
      setStatus("result");
      telegramSuccess();
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error : new Error(String(error)));
      setStatus("error");
    }
  });

  const createEntry = useMutation({
    mutationFn: () => {
      if (!pet || !result) throw new Error(t("noPet"));
      if (result.intent === "create_reminder") {
        const body = draft as ReminderDraft;
        return api("/api/reminders", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, time: new Date(body.time).toISOString(), repeatRule: body.repeatRule || null })
        });
      }
      if (result.intent === "create_medicine_entry") {
        const body = draft as MedicineDraft;
        return api("/api/medicines", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, dateTime: new Date(body.dateTime).toISOString(), note: body.note || null })
        });
      }
      if (result.intent === "create_note") {
        const body = draft as NoteDraft;
        return api("/api/notes", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, dateTime: new Date(body.dateTime).toISOString() })
        });
      }
      throw new Error(t("voiceUnknown"));
    },
    onSuccess: () => {
      if (pet) {
        queryClient.invalidateQueries({ queryKey: ["reminders", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["medicines", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["notes", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["diary"] });
        queryClient.invalidateQueries({ queryKey: ["report"] });
      }
      setResult(null);
      setDraft({});
      setStatus("idle");
      setCreated(true);
      telegramSuccess();
    }
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      shouldUploadRef.current = false;
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!isAdmin || !pet) return null;

  function reset() {
    setResult(null);
    setDraft({});
    setLocalError(null);
    setCreated(false);
    setStatus("idle");
    voiceCommand.reset();
    createEntry.reset();
  }

  async function startRecording() {
    telegramSelection();
    setLocalError(null);
    setCreated(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setLocalError(new Error(t("voiceUnsupported")));
      setStatus("error");
      telegramError();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      shouldUploadRef.current = true;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!shouldUploadRef.current) return;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!audio.size) {
          setLocalError(new Error(t("voiceEmptyRecording")));
          setStatus("error");
          return;
        }
        setStatus("uploading");
        voiceCommand.mutate(audio);
      };
      recorder.start();
      setStatus("recording");
      timerRef.current = window.setTimeout(() => stopRecording(), maxRecordingMs);
    } catch {
      setLocalError(new Error(t("voicePermissionDenied")));
      setStatus("error");
      telegramError();
    }
  }

  function stopRecording() {
    telegramSelection();
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function updateDraft(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const canCreate = result?.intent && result.intent !== "unknown";
  const pending = status === "uploading" || createEntry.isPending;

  return (
    <section className="panel space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">{t("voiceCommand")}</h2>
          <p className="muted mt-1">{t("voiceCommandHint")}</p>
        </div>
        {status === "recording" ? (
          <button className="btn shrink-0 whitespace-nowrap bg-coral px-3 text-white hover:bg-coral/90" type="button" onClick={stopRecording}>
            <Square size={17} />{t("stopRecording")}
          </button>
        ) : (
          <button className="btn btn-primary shrink-0 whitespace-nowrap px-3" type="button" disabled={pending} onClick={startRecording}>
            <Mic size={17} />{t("startRecording")}
          </button>
        )}
      </div>

      {status === "recording" && <p className="text-sm font-semibold text-coral">{t("recording")}</p>}
      {status === "uploading" && <p className="text-sm font-semibold text-mint">{t("uploadingVoice")}</p>}
      <RequestError error={localError ?? voiceCommand.error ?? createEntry.error} />
      {created && <p className="inline-flex items-center gap-2 text-sm font-bold text-mint"><Check size={16} />{t("voiceCreated")}</p>}

      {result && (
        <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="space-y-1 text-sm leading-6">
            <p><span className="font-bold">{t("voiceTranscript")}:</span> {result.transcript || "—"}</p>
            <p><span className="font-bold">{t("voiceIntent")}:</span> {intentLabel(result.intent, t)}</p>
            <p><span className="font-bold">{t("voiceConfidence")}:</span> {Math.round(result.confidence * 100)}%</p>
          </div>
          {result.warnings.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-900">
              <p>{t("voiceWarnings")}</p>
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
          {canCreate ? (
            <div className="grid gap-2">
              <p className="section-title">{t("voiceDraft")}</p>
              {result.intent === "create_reminder" && renderReminderDraft(draft as ReminderDraft, updateDraft, t)}
              {result.intent === "create_medicine_entry" && renderMedicineDraft(draft as MedicineDraft, updateDraft, t)}
              {result.intent === "create_note" && renderNoteDraft(draft as NoteDraft, updateDraft, t)}
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary whitespace-nowrap" type="button" disabled={createEntry.isPending} onClick={() => createEntry.mutate()}>
                  <Send size={17} />{t("createFromVoice")}
                </button>
                <button className="btn btn-secondary whitespace-nowrap" type="button" disabled={createEntry.isPending} onClick={reset}>
                  <X size={17} />{t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-secondary whitespace-nowrap" type="button" onClick={reset}><RotateCcw size={17} />{t("tryAgain")}</button>
              <button className="btn btn-muted whitespace-nowrap" type="button" onClick={reset}><X size={17} />{t("cancel")}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function renderReminderDraft(draft: ReminderDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <SelectField value={draft.type} onChange={(event) => updateDraft("type", event.target.value)}>
        <option value="FEEDING">{t("reminderTypeFeeding")}</option>
        <option value="MEDICINE">{t("reminderTypeMedicine")}</option>
        <option value="WEIGHT">{t("reminderTypeWeight")}</option>
        <option value="VET">{t("reminderTypeVet")}</option>
        <option value="OTHER">{t("other")}</option>
      </SelectField>
      <input className="input" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder={t("title")} />
      <DateTimeFields name="voiceReminderTime" value={draft.time} onChange={(value) => updateDraft("time", value)} />
      <SelectField value={draft.repeatRule} onChange={(event) => updateDraft("repeatRule", event.target.value)}>
        <option value="">{t("repeatNone")}</option>
        <option value="daily">{t("repeatDaily")}</option>
        <option value="weekly">{t("repeatWeekly")}</option>
        <option value="monthly">{t("repeatMonthly")}</option>
      </SelectField>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={draft.active} onChange={(event) => updateDraft("active", event.target.checked)} />{t("active")}
      </label>
    </>
  );
}

function renderMedicineDraft(draft: MedicineDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <input className="input" value={draft.medicineName} onChange={(event) => updateDraft("medicineName", event.target.value)} placeholder={t("medicineName")} />
      <input className="input" value={draft.dosage} onChange={(event) => updateDraft("dosage", event.target.value)} placeholder={t("dosage")} />
      <DateTimeFields name="voiceMedicineDateTime" value={draft.dateTime} onChange={(value) => updateDraft("dateTime", value)} />
      <textarea className="input" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("comment")} />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={draft.taken} onChange={(event) => updateDraft("taken", event.target.checked)} />{t("taken")}
      </label>
    </>
  );
}

function renderNoteDraft(draft: NoteDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <DateTimeFields name="voiceNoteDateTime" value={draft.dateTime} onChange={(value) => updateDraft("dateTime", value)} />
      <textarea className="input min-h-28" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("notePlaceholder")} />
    </>
  );
}
