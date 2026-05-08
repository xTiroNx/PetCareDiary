import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Mic, RotateCcw, Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, apiFormData, jsonBody } from "../api/client";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputValue, utcInstantToLocalDateTimeInput } from "../utils/dateTime";
import { useI18n } from "../utils/i18n";
import { telegramError, telegramSelection, telegramSuccess } from "../utils/telegram";
import { DateField } from "./DateField";
import { DateTimeFields } from "./DateTimeFields";
import { RequestError } from "./RequestError";
import { SelectField } from "./SelectField";
import { SeverityScale } from "./SeverityScale";

type VoiceIntent =
  | "create_reminder"
  | "create_feeding_entry"
  | "create_medicine_entry"
  | "create_symptom_entry"
  | "create_weight_entry"
  | "create_note"
  | "unknown";
type VoiceTarget = "reminder" | "diary" | "unknown";
type VoiceStatus = "idle" | "recording" | "uploading" | "result" | "error";
type VoiceResponse = {
  transcript: string;
  target: VoiceTarget;
  intent: VoiceIntent;
  confidence: number;
  needsConfirmation: true;
  draft: Record<string, unknown>;
  warnings: string[];
};
type ReminderDraft = { type: string; title: string; time: string; repeatRule: string; active: boolean };
type FeedingDraft = { dateTime: string; foodType: string; amount: string; note: string };
type MedicineDraft = { medicineName: string; dosage: string; dateTime: string; taken: boolean; note: string };
type SymptomDraft = { dateTime: string; symptomType: string; severity: string; note: string };
type WeightDraft = { date: string; weightKg: string };
type NoteDraft = { dateTime: string; note: string };
type EditableDraft = Record<string, string | boolean>;
type AudioContextConstructor = new () => AudioContext;
type VoiceCommandProps = {
  endpoint?: "/api/admin/voice/command" | "/api/voice/command";
  hint?: string;
  visible?: boolean;
};

const maxRecordingMs = 30000;
const waveformBars = 18;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeDateTime(value: unknown) {
  return utcInstantToLocalDateTimeInput(value);
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
  if (intent === "create_feeding_entry") {
    return {
      dateTime: normalizeDateTime(draft.dateTime),
      foodType: asString(draft.foodType, "OTHER"),
      amount: asString(draft.amount),
      note: asString(draft.note)
    };
  }
  if (intent === "create_symptom_entry") {
    return {
      dateTime: normalizeDateTime(draft.dateTime),
      symptomType: asString(draft.symptomType, "OTHER"),
      severity: String(typeof draft.severity === "number" ? draft.severity : asString(draft.severity, "1")),
      note: asString(draft.note)
    };
  }
  if (intent === "create_weight_entry") {
    return {
      date: normalizeDateTime(draft.date).slice(0, 10),
      weightKg: String(typeof draft.weightKg === "number" ? draft.weightKg : asString(draft.weightKg))
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
  if (intent === "create_feeding_entry") return t("feeding");
  if (intent === "create_medicine_entry") return t("voiceIntentMedicine");
  if (intent === "create_symptom_entry") return t("symptom");
  if (intent === "create_weight_entry") return t("weight");
  if (intent === "create_note") return t("voiceIntentNote");
  return t("voiceIntentUnknown");
}

function voiceCommandErrorMessage(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "VOICE_COMMANDS_DISABLED") return t("voiceErrorDisabled");
  if (code === "VOICE_LIMIT_REACHED") return t("voiceErrorLimit");
  if (code === "VOICE_AUDIO_TOO_LARGE") return t("voiceErrorTooLarge");
  if (code === "VOICE_AUDIO_UNSUPPORTED") return t("voiceErrorUnsupportedAudio");
  if (code === "VOICE_TRANSCRIPTION_FAILED") return t("voiceErrorTranscription");
  if (code === "VOICE_PARSE_FAILED") return t("voiceErrorParse");
  return error instanceof Error ? error.message : String(error);
}

function isDiaryIntent(intent: VoiceIntent) {
  return (
    intent === "create_feeding_entry" ||
    intent === "create_medicine_entry" ||
    intent === "create_symptom_entry" ||
    intent === "create_weight_entry" ||
    intent === "create_note"
  );
}

function canCreateFromVoice(result: VoiceResponse | null) {
  if (!result || result.intent === "unknown") return false;
  if (result.target === "reminder") return result.intent === "create_reminder";
  if (result.target === "diary") return isDiaryIntent(result.intent);
  return false;
}

function formatRecordingTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, "0")}`;
}

function VoiceRecordingVisualizer({
  audioVisualizerSupported,
  elapsedMs,
  waveform
}: {
  audioVisualizerSupported: boolean;
  elapsedMs: number;
  waveform: number[];
}) {
  const progress = Math.min(1, elapsedMs / maxRecordingMs);
  const fallbackLevels = [0.18, 0.38, 0.62, 0.32, 0.72, 0.44, 0.24, 0.56, 0.82, 0.46, 0.28, 0.66, 0.5, 0.3, 0.7, 0.42, 0.22, 0.54];
  const levels = audioVisualizerSupported ? waveform : fallbackLevels;

  return (
    <div className="rounded-xl border border-mint/30 bg-mint/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-coral">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-mint text-white">
            {!audioVisualizerSupported && <span className="absolute inset-0 animate-ping rounded-full bg-mint/40" />}
            <Mic size={15} className="relative" />
          </span>
          REC
        </span>
        <span className="text-sm font-extrabold tabular-nums text-coral">
          {formatRecordingTime(elapsedMs)} / 0:30
        </span>
      </div>
      <div className="mx-auto flex h-14 w-full max-w-[320px] items-center justify-center gap-1 overflow-hidden px-1">
        {levels.map((level, index) => (
          <span
            className={audioVisualizerSupported ? "min-w-[4px] flex-1 rounded-full bg-mint transition-[height] duration-75" : "min-w-[4px] flex-1 animate-pulse rounded-full bg-mint"}
            key={index}
            style={{
              animationDelay: `${index * 55}ms`,
              height: `${8 + level * 40}px`,
              opacity: audioVisualizerSupported ? 0.42 + level * 0.58 : 0.5 + level * 0.35
            }}
          />
        ))}
      </div>
      <div className="mx-auto mt-2 h-1.5 w-full max-w-[320px] overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-coral transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export function VoiceCommand({ endpoint = "/api/voice/command", hint, visible = true }: VoiceCommandProps) {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [result, setResult] = useState<VoiceResponse | null>(null);
  const [draft, setDraft] = useState<EditableDraft>({});
  const [localError, setLocalError] = useState<Error | null>(null);
  const [created, setCreated] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [waveform, setWaveform] = useState(() => Array.from({ length: waveformBars }, () => 0.08));
  const [audioVisualizerSupported, setAudioVisualizerSupported] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingClockRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartedAtRef = useRef(0);
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
      return apiFormData<VoiceResponse>(endpoint, formData);
    },
    onSuccess: (response) => {
      setResult(response);
      setDraft(normalizeDraft(response.intent, response.draft ?? {}));
      setStatus("result");
      telegramSuccess();
    },
    onError: (error) => {
      setLocalError(new Error(voiceCommandErrorMessage(error, t)));
      setStatus("error");
    }
  });

  const createEntry = useMutation({
    mutationFn: () => {
      if (!pet || !result) throw new Error(t("noPet"));
      if (!canCreateFromVoice(result)) throw new Error(t("voiceUnknown"));
      if (result.target === "reminder" && result.intent === "create_reminder") {
        const body = draft as ReminderDraft;
        return api("/api/reminders", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, time: new Date(body.time).toISOString(), repeatRule: body.repeatRule || null })
        });
      }
      if (result.target === "diary" && result.intent === "create_feeding_entry") {
        const body = draft as FeedingDraft;
        return api("/api/feeding", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, dateTime: new Date(body.dateTime).toISOString(), note: body.note || null })
        });
      }
      if (result.target === "diary" && result.intent === "create_medicine_entry") {
        const body = draft as MedicineDraft;
        return api("/api/medicines", {
          method: "POST",
          body: jsonBody({ ...body, petId: pet.id, dateTime: new Date(body.dateTime).toISOString(), note: body.note || null })
        });
      }
      if (result.target === "diary" && result.intent === "create_symptom_entry") {
        const body = draft as SymptomDraft;
        return api("/api/symptoms", {
          method: "POST",
          body: jsonBody({
            ...body,
            petId: pet.id,
            severity: Number(body.severity),
            dateTime: new Date(body.dateTime).toISOString(),
            note: body.note || null
          })
        });
      }
      if (result.target === "diary" && result.intent === "create_weight_entry") {
        const body = draft as WeightDraft;
        return api("/api/weights", {
          method: "POST",
          body: jsonBody({ petId: pet.id, weightKg: Number(body.weightKg), date: new Date(body.date).toISOString() })
        });
      }
      if (result.target === "diary" && result.intent === "create_note") {
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
        queryClient.invalidateQueries({ queryKey: ["feeding", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["medicines", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["symptoms", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["symptoms-analytics", pet.id] });
        queryClient.invalidateQueries({ queryKey: ["weights", pet.id] });
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
      shouldUploadRef.current = false;
      cleanupRecordingResources();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    };
  }, []);

  if (!visible || !pet) return null;

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
    setRecordingMs(0);
    setWaveform(Array.from({ length: waveformBars }, () => 0.08));
    setAudioVisualizerSupported(true);
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
      startVisualizer(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cleanupRecordingResources();
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
      recordingStartedAtRef.current = Date.now();
      setStatus("recording");
      timerRef.current = window.setTimeout(() => stopRecording(), maxRecordingMs);
      recordingClockRef.current = window.setInterval(() => {
        setRecordingMs(Math.min(Date.now() - recordingStartedAtRef.current, maxRecordingMs));
      }, 250);
    } catch {
      cleanupRecordingResources();
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

  function cleanupRecordingResources() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (recordingClockRef.current) {
      window.clearInterval(recordingClockRef.current);
      recordingClockRef.current = null;
    }
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  function startVisualizer(stream: MediaStream) {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextClass) {
      setAudioVisualizerSupported(false);
      return;
    }

    try {
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.48;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = context;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);
      let smoothedVolume = 0.12;

      function tick() {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeData);
        const rms = Math.sqrt(timeData.reduce((sum, value) => {
          const centered = (value - 128) / 128;
          return sum + centered * centered;
        }, 0) / timeData.length);
        const volume = Math.min(1, Math.pow(Math.max(0, (rms - 0.006) * 18), 0.72));
        smoothedVolume = smoothedVolume * 0.36 + volume * 0.64;
        const next = Array.from({ length: waveformBars }, (_value, index) => {
          const center = (waveformBars - 1) / 2;
          const distanceFromCenter = Math.abs(index - center) / center;
          const centerWeight = 1 - distanceFromCenter * 0.5;
          const pairIndex = Math.min(index, waveformBars - 1 - index);
          const frequencyPosition = Math.floor((pairIndex / (waveformBars / 2)) * frequencyData.length);
          const frequencyLevel = Math.min(1, Math.pow(frequencyData[frequencyPosition] / 255, 0.58) * 2.8);
          const ripple = 0.08 * Math.sin(Date.now() / 80 + index * 0.85);
          const level = smoothedVolume * 2.25 * centerWeight + frequencyLevel * 0.5 + ripple;
          return Math.max(0.12, Math.min(1, level));
        });
        setWaveform(next);
        animationFrameRef.current = window.requestAnimationFrame(tick);
      }

      tick();
    } catch {
      setAudioVisualizerSupported(false);
    }
  }

  function updateDraft(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const canCreate = canCreateFromVoice(result);
  const pending = status === "uploading" || createEntry.isPending;

  return (
    <section className="panel space-y-3">
      <div className="grid gap-2.5">
        <div className="min-w-0 text-center">
          <h2 className="section-title">{t("voiceCommand")}</h2>
        </div>
        <div className="flex justify-center">
          {status === "recording" ? (
            <button className="btn min-w-[144px] shrink-0 whitespace-nowrap border border-coral/45 bg-coral/10 px-4 text-coral hover:bg-coral/15" type="button" onClick={stopRecording}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white">
                <Square size={13} fill="currentColor" strokeWidth={2.4} />
              </span>
              {t("stopRecording")}
            </button>
          ) : (
            <button className="btn btn-primary min-w-[156px] shrink-0 whitespace-nowrap px-4" type="button" disabled={pending} onClick={startRecording}>
              <Mic size={17} />{t("startRecording")}
            </button>
          )}
        </div>
        <div className="min-w-0 text-center">
          <p className="muted mt-1">{hint ?? t("voiceCommandHint")}</p>
          <p className="mx-auto mt-2 max-w-[22rem] rounded-lg border border-mint/20 bg-mint/5 px-3 py-2 text-sm font-semibold leading-5 text-zinc-600 dark:bg-mint/10 dark:text-zinc-300">
            {t("voiceCommandExample")}
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t("voiceDurationHint")}</p>
        </div>
      </div>

      {status === "recording" && <p className="text-center text-sm font-semibold text-coral">{t("recording")}</p>}
      {status === "recording" && (
        <VoiceRecordingVisualizer
          audioVisualizerSupported={audioVisualizerSupported}
          elapsedMs={recordingMs}
          waveform={waveform}
        />
      )}
      {status === "uploading" && <p className="text-center text-sm font-semibold text-mint">{t("uploadingVoice")}</p>}
      <div className="text-center">
        <RequestError error={localError ?? voiceCommand.error ?? createEntry.error} />
      </div>
      {created && <p className="inline-flex w-full items-center justify-center gap-2 text-center text-sm font-bold text-mint"><Check size={16} />{t("voiceCreated")}</p>}

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
              {result.intent === "create_feeding_entry" && renderFeedingDraft(draft as FeedingDraft, updateDraft, t)}
              {result.intent === "create_medicine_entry" && renderMedicineDraft(draft as MedicineDraft, updateDraft, t)}
              {result.intent === "create_symptom_entry" && renderSymptomDraft(draft as SymptomDraft, updateDraft, t)}
              {result.intent === "create_weight_entry" && renderWeightDraft(draft as WeightDraft, updateDraft, t)}
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

export function AdminVoiceCommand() {
  const { t } = useI18n();
  const isAdmin = useAppStore((state) => state.isAdmin);
  const pet = useAppStore((state) => state.pet);
  return <VoiceCommand endpoint="/api/admin/voice/command" hint={t("voiceCommandHint")} visible={isAdmin && Boolean(pet)} />;
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

function renderFeedingDraft(draft: FeedingDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <DateTimeFields name="voiceFeedingDateTime" value={draft.dateTime} onChange={(value) => updateDraft("dateTime", value)} />
      <SelectField value={draft.foodType} onChange={(event) => updateDraft("foodType", event.target.value)}>
        <option value="DRY">{t("dryFood")}</option>
        <option value="WET">{t("wetFood")}</option>
        <option value="NATURAL">{t("naturalFood")}</option>
        <option value="TREAT">{t("treat")}</option>
        <option value="OTHER">{t("other")}</option>
      </SelectField>
      <input className="input" value={draft.amount} onChange={(event) => updateDraft("amount", event.target.value)} placeholder={t("amount")} />
      <textarea className="input" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("comment")} />
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

function renderSymptomDraft(draft: SymptomDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <DateTimeFields name="voiceSymptomDateTime" value={draft.dateTime} onChange={(value) => updateDraft("dateTime", value)} />
      <SelectField value={draft.symptomType} onChange={(event) => updateDraft("symptomType", event.target.value)}>
        <option value="VOMITING">{t("vomiting")}</option>
        <option value="YELLOW_VOMIT">{t("yellowVomit")}</option>
        <option value="NO_APPETITE">{t("noAppetite")}</option>
        <option value="DIARRHEA">{t("diarrhea")}</option>
        <option value="CONSTIPATION">{t("constipation")}</option>
        <option value="LETHARGY">{t("lethargy")}</option>
        <option value="PAIN">{t("pain")}</option>
        <option value="OTHER">{t("other")}</option>
      </SelectField>
      <SeverityScale name="voiceSymptomSeverity" value={draft.severity} onChange={(severity) => updateDraft("severity", severity)} />
      <textarea className="input" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("comment")} />
    </>
  );
}

function renderWeightDraft(draft: WeightDraft, updateDraft: (key: string, value: string | boolean) => void, t: ReturnType<typeof useI18n>["t"]) {
  return (
    <>
      <DateField name="voiceWeightDate" value={draft.date} onChange={(value) => updateDraft("date", value)} />
      <input className="input" type="number" step="0.1" value={draft.weightKg} onChange={(event) => updateDraft("weightKg", event.target.value)} placeholder={t("weightKg")} />
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
