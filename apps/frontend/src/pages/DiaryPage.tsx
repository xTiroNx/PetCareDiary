import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Edit3, FileText, HeartPulse, Pill, Save, Scale, Trash2, Utensils, X } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateField } from "../components/DateField";
import { DateTimeFields } from "../components/DateTimeFields";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { SeverityScale } from "../components/SeverityScale";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateInputValue, localDateTimeInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type DiaryType = "ALL" | "FEEDING" | "SYMPTOM" | "MEDICINE" | "WEIGHT" | "NOTE";
type PeriodMode = "today" | "7" | "30" | "all" | "custom";

type FeedingEntry = { id: string; dateTime: string; foodType: string; amount: string; note?: string };
type SymptomEntry = { id: string; dateTime: string; symptomType: string; severity: number; note?: string };
type MedicineEntry = { id: string; medicineName: string; dosage: string; dateTime: string; taken: boolean; note?: string };
type WeightEntry = { id: string; date: string; weightKg: string };
type NoteEntry = { id: string; dateTime: string; note: string };

type TimelineEntry = {
  id: string;
  type: Exclude<DiaryType, "ALL">;
  date: string;
  title: string;
  detail: string;
  note?: string;
  endpoint: string;
  raw: FeedingEntry | SymptomEntry | MedicineEntry | WeightEntry | NoteEntry;
};

type EditDraft = Record<string, string | boolean>;

function toApiDate(value: string, endOfDay = false) {
  if (!value) return "";
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

function buildQuery(petId: string, from: string, to: string) {
  const params = new URLSearchParams({ petId });
  if (from) params.set("from", toApiDate(from));
  if (to) params.set("to", toApiDate(to, true));
  return params.toString();
}

export default function DiaryPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const currentDate = localDateInputValue();
  const [type, setType] = useState<DiaryType>("ALL");
  const [from, setFrom] = useState(currentDate);
  const [to, setTo] = useState(currentDate);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("today");
  const [editing, setEditing] = useState<TimelineEntry | null>(null);
  const [draft, setDraft] = useState<EditDraft>({});

  const query = buildQuery(pet?.id ?? "", from, to);
  const feeding = usePaginatedApi<FeedingEntry>(["diary", "feeding", pet?.id, from, to], `/api/feeding?${query}`, Boolean(pet) && (type === "ALL" || type === "FEEDING"), 12);
  const symptoms = usePaginatedApi<SymptomEntry>(["diary", "symptoms", pet?.id, from, to], `/api/symptoms?${query}`, Boolean(pet) && (type === "ALL" || type === "SYMPTOM"), 12);
  const medicines = usePaginatedApi<MedicineEntry>(["diary", "medicines", pet?.id, from, to], `/api/medicines?${query}`, Boolean(pet) && (type === "ALL" || type === "MEDICINE"), 12);
  const weights = usePaginatedApi<WeightEntry>(["diary", "weights", pet?.id, from, to], `/api/weights?${query}`, Boolean(pet) && (type === "ALL" || type === "WEIGHT"), 12);
  const notes = usePaginatedApi<NoteEntry>(["diary", "notes", pet?.id, from, to], `/api/notes?${query}`, Boolean(pet) && (type === "ALL" || type === "NOTE"), 12);

  const deleteEntry = useMutation({
    mutationFn: (entry: TimelineEntry) => api<void>(`${entry.endpoint}/${entry.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary"] })
  });

  const updateEntry = useMutation({
    mutationFn: ({ entry, body }: { entry: TimelineEntry; body: Record<string, unknown> }) => api(`${entry.endpoint}/${entry.id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditing(null);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["diary"] });
    }
  });

  const labels = {
    food: { DRY: t("dryFood"), WET: t("wetFood"), NATURAL: t("naturalFood"), TREAT: t("treat"), OTHER: t("other") } as Record<string, string>,
    symptom: { VOMITING: t("vomiting"), YELLOW_VOMIT: t("yellowVomit"), NO_APPETITE: t("noAppetite"), DIARRHEA: t("diarrhea"), CONSTIPATION: t("constipation"), LETHARGY: t("lethargy"), PAIN: t("pain"), OTHER: t("other") } as Record<string, string>
  };

  const timeline = useMemo<TimelineEntry[]>(() => {
    return [
      ...feeding.items.map((entry) => ({
        id: entry.id,
        type: "FEEDING" as const,
        date: entry.dateTime,
        title: t("feeding"),
        detail: `${labels.food[entry.foodType] ?? entry.foodType} · ${entry.amount}`,
        note: entry.note,
        endpoint: "/api/feeding",
        raw: entry
      })),
      ...symptoms.items.map((entry) => ({
        id: entry.id,
        type: "SYMPTOM" as const,
        date: entry.dateTime,
        title: t("symptom"),
        detail: `${labels.symptom[entry.symptomType] ?? entry.symptomType} · ${t("severity")} ${entry.severity}/5`,
        note: entry.note,
        endpoint: "/api/symptoms",
        raw: entry
      })),
      ...medicines.items.map((entry) => ({
        id: entry.id,
        type: "MEDICINE" as const,
        date: entry.dateTime,
        title: t("medicine"),
        detail: `${entry.medicineName} · ${entry.dosage} · ${entry.taken ? t("yes") : t("no")}`,
        note: entry.note,
        endpoint: "/api/medicines",
        raw: entry
      })),
      ...weights.items.map((entry) => ({
        id: entry.id,
        type: "WEIGHT" as const,
        date: entry.date,
        title: t("weight"),
        detail: `${entry.weightKg} kg`,
        endpoint: "/api/weights",
        raw: entry
      })),
      ...notes.items.map((entry) => ({
        id: entry.id,
        type: "NOTE" as const,
        date: entry.dateTime,
        title: t("otherNote"),
        detail: t("noteText"),
        note: entry.note,
        endpoint: "/api/notes",
        raw: entry
      }))
    ]
      .filter((entry) => type === "ALL" || entry.type === type)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [feeding.items, labels.food, labels.symptom, medicines.items, notes.items, symptoms.items, t, type, weights.items]);

  const activeSources = [feeding, symptoms, medicines, weights, notes].filter((source) => source.isEnabled);
  const isLoading = activeSources.some((source) => source.isLoading);
  const isFetchingMore = activeSources.some((source) => source.isFetchingNextPage);
  const hasMore = activeSources.some((source) => source.hasNextPage);
  const listError = activeSources.find((source) => source.error)?.error;

  function loadMore() {
    void Promise.all(activeSources.filter((source) => source.hasNextPage).map((source) => source.fetchNextPage()));
  }

  const tabs: Array<{ value: DiaryType; label: string }> = [
    { value: "ALL", label: t("all") },
    { value: "FEEDING", label: t("feeding") },
    { value: "SYMPTOM", label: t("symptom") },
    { value: "MEDICINE", label: t("medicine") },
    { value: "WEIGHT", label: t("weight") },
    { value: "NOTE", label: t("otherNote") }
  ];

  const iconByType = {
    FEEDING: Utensils,
    SYMPTOM: HeartPulse,
    MEDICINE: Pill,
    WEIGHT: Scale,
    NOTE: FileText
  };

  function setQuickPeriod(days: number, mode: PeriodMode) {
    const now = new Date();
    const start = new Date(now.getTime() - (days - 1) * 86400000);
    setPeriodMode(mode);
    setFrom(localDateInputValue(start));
    setTo(localDateInputValue(now));
  }

  function setAllPeriod() {
    setPeriodMode("all");
    setFrom("");
    setTo("");
  }

  function setCustomPeriod() {
    setPeriodMode("custom");
    if (!from) setFrom(currentDate);
    if (!to) setTo(currentDate);
  }

  function updateDraft(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startEdit(entry: TimelineEntry) {
    setEditing(entry);
    if (entry.type === "FEEDING") {
      const raw = entry.raw as FeedingEntry;
      setDraft({ dateTime: localDateTimeInputValue(new Date(raw.dateTime)), foodType: raw.foodType, amount: raw.amount, note: raw.note ?? "" });
    }
    if (entry.type === "SYMPTOM") {
      const raw = entry.raw as SymptomEntry;
      setDraft({ dateTime: localDateTimeInputValue(new Date(raw.dateTime)), symptomType: raw.symptomType, severity: String(raw.severity), note: raw.note ?? "" });
    }
    if (entry.type === "MEDICINE") {
      const raw = entry.raw as MedicineEntry;
      setDraft({ dateTime: localDateTimeInputValue(new Date(raw.dateTime)), medicineName: raw.medicineName, dosage: raw.dosage, taken: raw.taken, note: raw.note ?? "" });
    }
    if (entry.type === "WEIGHT") {
      const raw = entry.raw as WeightEntry;
      setDraft({ date: localDateInputValue(new Date(raw.date)), weightKg: String(raw.weightKg) });
    }
    if (entry.type === "NOTE") {
      const raw = entry.raw as NoteEntry;
      setDraft({ dateTime: localDateTimeInputValue(new Date(raw.dateTime)), note: raw.note });
    }
  }

  function saveEdit(entry: TimelineEntry) {
    if (!pet) return;
    if (entry.type === "FEEDING") {
      updateEntry.mutate({ entry, body: { petId: pet.id, dateTime: new Date(String(draft.dateTime)).toISOString(), foodType: draft.foodType, amount: draft.amount, note: draft.note || null } });
    }
    if (entry.type === "SYMPTOM") {
      updateEntry.mutate({ entry, body: { petId: pet.id, dateTime: new Date(String(draft.dateTime)).toISOString(), symptomType: draft.symptomType, severity: Number(draft.severity), note: draft.note || null } });
    }
    if (entry.type === "MEDICINE") {
      updateEntry.mutate({ entry, body: { petId: pet.id, dateTime: new Date(String(draft.dateTime)).toISOString(), medicineName: draft.medicineName, dosage: draft.dosage, taken: Boolean(draft.taken), note: draft.note || null } });
    }
    if (entry.type === "WEIGHT") {
      updateEntry.mutate({ entry, body: { petId: pet.id, date: new Date(String(draft.date)).toISOString(), weightKg: Number(draft.weightKg) } });
    }
    if (entry.type === "NOTE") {
      updateEntry.mutate({ entry, body: { petId: pet.id, dateTime: new Date(String(draft.dateTime)).toISOString(), note: draft.note } });
    }
  }

  function renderEditForm(entry: TimelineEntry) {
    return (
      <div className="mt-3 grid gap-2">
        {entry.type !== "WEIGHT" && <DateTimeFields value={String(draft.dateTime ?? "")} onChange={(dateTime) => updateDraft("dateTime", dateTime)} />}
        {entry.type === "WEIGHT" && <DateField value={String(draft.date ?? "")} onChange={(date) => updateDraft("date", date)} />}
        {entry.type === "FEEDING" && (
          <>
            <SelectField value={String(draft.foodType ?? "DRY")} onChange={(event) => updateDraft("foodType", event.target.value)}>
              <option value="DRY">{t("dryFood")}</option><option value="WET">{t("wetFood")}</option><option value="NATURAL">{t("naturalFood")}</option><option value="TREAT">{t("treat")}</option><option value="OTHER">{t("other")}</option>
            </SelectField>
            <input className="input" value={String(draft.amount ?? "")} onChange={(event) => updateDraft("amount", event.target.value)} placeholder={t("amount")} />
            <textarea className="input" value={String(draft.note ?? "")} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("note")} />
          </>
        )}
        {entry.type === "SYMPTOM" && (
          <>
            <SelectField value={String(draft.symptomType ?? "VOMITING")} onChange={(event) => updateDraft("symptomType", event.target.value)}>
              <option value="VOMITING">{t("vomiting")}</option><option value="YELLOW_VOMIT">{t("yellowVomit")}</option><option value="NO_APPETITE">{t("noAppetite")}</option><option value="DIARRHEA">{t("diarrhea")}</option><option value="CONSTIPATION">{t("constipation")}</option><option value="LETHARGY">{t("lethargy")}</option><option value="PAIN">{t("pain")}</option><option value="OTHER">{t("other")}</option>
            </SelectField>
            <SeverityScale value={String(draft.severity ?? "1")} onChange={(severity) => updateDraft("severity", severity)} />
            <textarea className="input" value={String(draft.note ?? "")} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("comment")} />
          </>
        )}
        {entry.type === "MEDICINE" && (
          <>
            <input className="input" value={String(draft.medicineName ?? "")} onChange={(event) => updateDraft("medicineName", event.target.value)} placeholder={t("medicineName")} />
            <input className="input" value={String(draft.dosage ?? "")} onChange={(event) => updateDraft("dosage", event.target.value)} placeholder={t("dosage")} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(draft.taken)} onChange={(event) => updateDraft("taken", event.target.checked)} />{t("taken")}</label>
            <textarea className="input" value={String(draft.note ?? "")} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("comment")} />
          </>
        )}
        {entry.type === "WEIGHT" && <input className="input" type="number" step="0.1" value={String(draft.weightKg ?? "")} onChange={(event) => updateDraft("weightKg", event.target.value)} placeholder={t("weightKg")} />}
        {entry.type === "NOTE" && <textarea className="input min-h-24" value={String(draft.note ?? "")} onChange={(event) => updateDraft("note", event.target.value)} placeholder={t("notePlaceholder")} />}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" disabled={updateEntry.isPending} onClick={() => saveEdit(entry)}><Save size={16} />{t("save")}</button>
          <button className="btn btn-secondary" onClick={() => { setEditing(null); setDraft({}); }}><X size={16} />{t("cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-4">
      <header>
        <p className="text-sm font-semibold text-mint">PetCare Diary</p>
        <h1 className="page-title">{t("diaryTitle")}</h1>
        <p className="muted mt-1">{t("diarySubtitle")}</p>
      </header>

      <section className="panel space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={17} className="text-mint" />
          {t("period")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={clsx("btn min-h-9 px-2 text-xs", periodMode === "today" ? "btn-primary" : "btn-secondary")} onClick={() => setQuickPeriod(1, "today")}>{t("today")}</button>
          <button className={clsx("btn min-h-9 px-2 text-xs", periodMode === "7" ? "btn-primary" : "btn-secondary")} onClick={() => setQuickPeriod(7, "7")}>{t("last7")}</button>
          <button className={clsx("btn min-h-9 px-2 text-xs", periodMode === "30" ? "btn-primary" : "btn-secondary")} onClick={() => setQuickPeriod(30, "30")}>{t("last30")}</button>
          <button className={clsx("btn min-h-9 px-2 text-xs", periodMode === "all" ? "btn-primary" : "btn-secondary")} onClick={setAllPeriod}>{t("allPeriod")}</button>
          <button className={clsx("btn col-span-2 min-h-9 px-2 text-xs", periodMode === "custom" ? "btn-primary" : "btn-secondary")} onClick={setCustomPeriod}>{t("period")}</button>
        </div>
        {periodMode === "custom" && (
          <div className="grid gap-2">
            <DateField label={t("fromDate")} value={from} onChange={setFrom} />
            <DateField label={t("toDate")} value={to} onChange={setTo} />
          </div>
        )}
        <button className="btn btn-muted w-full min-h-9" onClick={() => { setPeriodMode("today"); setFrom(currentDate); setTo(currentDate); setType("ALL"); }}>
          {t("resetFilters")}
        </button>
      </section>

      <section className="space-y-2">
        <p className="section-title">{t("recordType")}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={clsx("shrink-0 rounded-lg px-3 py-2 text-sm font-bold leading-tight transition", type === tab.value ? "bg-mint text-white shadow-soft" : "border border-zinc-200 bg-white text-ink dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100")}
              onClick={() => setType(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{t("allRecords")}</h2>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink dark:bg-zinc-900 dark:text-white">{timeline.length}</span>
        </div>
        {isLoading ? <div className="panel text-center">{t("loading")}</div> : null}
        {!isLoading && !timeline.length ? <EmptyState title={t("emptyTitle")} text={t("noRecordsFiltered")} /> : null}
        {timeline.map((entry) => {
          const Icon = iconByType[entry.type];
          return (
            <article className="panel flex gap-3" key={`${entry.type}-${entry.id}`}>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint/15 text-mint">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{entry.title}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{entry.detail}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startEdit(entry)}>
                      <Edit3 size={16} />
                    </button>
                    <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={deleteEntry.isPending} onConfirm={() => deleteEntry.mutate(entry)}>
                      <Trash2 size={16} />
                    </ConfirmAction>
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{new Date(entry.date).toLocaleString(languageLocale(language))}</p>
                {entry.note ? <p className="mt-2 text-sm">{entry.note}</p> : null}
                {editing?.id === entry.id && editing.type === entry.type ? renderEditForm(entry) : null}
              </div>
            </article>
          );
        })}
        <LoadMore shown={timeline.length} total={hasMore ? timeline.length + 1 : timeline.length} onClick={loadMore} />
        {isFetchingMore ? <p className="text-center text-xs font-semibold text-zinc-500">{t("loading")}</p> : null}
        <RequestError error={listError ?? deleteEntry.error ?? updateEntry.error} />
      </section>
    </main>
  );
}
