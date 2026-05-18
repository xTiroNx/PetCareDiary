import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ActionAttachmentPicker } from "../components/ActionAttachmentPicker";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateField } from "../components/DateField";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SkeletonBlock } from "../components/SkeletonBlock";
import { SuccessFlash } from "../components/SuccessFlash";
import { useEntryAttachmentUpload } from "../hooks/useEntryAttachmentUpload";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useSuccessFlash } from "../hooks/useSuccessFlash";
import { useAppStore } from "../store/appStore";
import { localDateInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type WeightEntry = { id: string; date: string; weightKg: string };
type WeightDraft = { date: string; weightKg: string };

function dateTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortWeightsByDate(values: WeightEntry[]) {
  return [...values].sort((left, right) => dateTime(left.date) - dateTime(right.date));
}

function chartPoint(entry: WeightEntry, index: number, total: number, min: number, range: number) {
  const weight = Number(entry.weightKg);
  const x = total === 1 ? 160 : 24 + (index / (total - 1)) * 272;
  const y = total === 1 ? 74 : 118 - ((weight - min) / range) * 82;
  return { id: entry.id, x, y, weight, date: new Date(entry.date) };
}

function WeightChart({ values, locale }: { values: WeightEntry[]; locale: string }) {
  const numericWeights = values.map((entry) => Number(entry.weightKg)).filter(Number.isFinite);
  if (!numericWeights.length) {
    return <div className="mt-4 rounded-lg bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:bg-zinc-950">—</div>;
  }

  const min = Math.min(...numericWeights);
  const max = Math.max(...numericWeights);
  const range = Math.max(0.5, max - min);
  const points = values.map((entry, index) => chartPoint(entry, index, values.length, min, range));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length > 1
    ? `M ${points[0].x} 130 L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} 130 Z`
    : "";
  const last = points[points.length - 1];
  const firstDate = points[0].date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  const lastDate = last.date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });

  return (
    <div className="mt-4 rounded-xl border border-mint/20 bg-mint/5 p-3">
      <svg className="h-44 w-full overflow-visible" viewBox="0 0 320 150" role="img" aria-label="Weight chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="weight-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(42 166 147)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(42 166 147)" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[32, 74, 116].map((y) => (
          <line key={y} x1="18" x2="302" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
        ))}
        {area && <path d={area} fill="url(#weight-chart-fill)" />}
        {points.length > 1 ? (
          <polyline points={line} fill="none" stroke="rgb(42 166 147)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" vectorEffect="non-scaling-stroke" />
        ) : (
          <line x1="92" x2="228" y1={last.y} y2={last.y} stroke="rgb(42 166 147)" strokeLinecap="round" strokeWidth="5" vectorEffect="non-scaling-stroke" />
        )}
        {points.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="7" fill="rgb(42 166 147)" />
            <circle cx={point.x} cy={point.y} r="11" fill="none" stroke="rgb(42 166 147)" strokeOpacity="0.24" strokeWidth="5" />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs font-semibold text-zinc-500">
        <span>{firstDate}</span>
        <span className="rounded-full bg-mint/10 px-2 py-1 text-mint">{last.weight.toFixed(1)} kg</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

export default function WeightPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const attachment = useEntryAttachmentUpload("WEIGHT", pet?.id, t);
  const saved = useSuccessFlash();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WeightDraft | null>(null);
  const entries = usePaginatedApi<WeightEntry>(["weights", pet?.id], `/api/weights?petId=${pet?.id ?? ""}`, Boolean(pet));
  const add = useMutation<WeightEntry, Error, Record<string, unknown>>({
    mutationFn: (body) => api<WeightEntry>("/api/weights", { method: "POST", body: jsonBody(body) }),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["weights", pet?.id] });
      await attachment.uploadForEntry(created.id);
      saved.show();
    }
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/weights/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["weights", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/weights/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weights", pet?.id] })
  });
  const chartValues = sortWeightsByDate(entries.items);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({ ...data, petId: pet!.id, weightKg: Number(data.weightKg), date: new Date(String(data.date)).toISOString() });
    event.currentTarget.reset();
  }

  function startEdit(entry: WeightEntry) {
    setEditingId(entry.id);
    setDraft({
      date: localDateInputValue(new Date(entry.date)),
      weightKg: String(entry.weightKg)
    });
  }

  function saveEdit(id: string) {
    if (!draft) return;
    update.mutate({
      id,
      body: {
        weightKg: Number(draft.weightKg),
        petId: pet!.id,
        date: new Date(draft.date).toISOString()
      }
    });
  }

  return (
    <main className="space-y-4">
      <h1 className="page-title">{t("weightTitle")}</h1>
      <form onSubmit={onSubmit} className="panel grid gap-3">
        <DateField name="date" defaultValue={localDateInputValue()} required />
        <input className="input" name="weightKg" type="number" step="0.1" placeholder={t("weightKg")} required />
        <ActionAttachmentPicker visible file={attachment.file} disabled={add.isPending || attachment.isUploading} isPreparing={attachment.isUploading} uploadError={attachment.error} onFileChange={attachment.selectFile} onClear={attachment.clearFile} />
        <button className="btn btn-primary" disabled={add.isPending || attachment.isUploading}>{t("add")}</button>
        <SuccessFlash show={saved.visible} />
        <RequestError error={add.error} />
      </form>
      <section className="panel">
        <h2 className="section-title">{t("weightChart")}</h2>
        <WeightChart values={chartValues} locale={languageLocale(language)} />
      </section>
      {entries.isLoading && <SkeletonBlock rows={3} />}
      {entries.error && <div className="panel text-coral"><RequestError error={entries.error} /></div>}
      {entries.items.length ? (
        <>
        {entries.items.map((entry) => (
        <div className="panel space-y-3" key={entry.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{entry.weightKg} kg</p>
              <p className="text-sm text-zinc-500">{new Date(entry.date).toLocaleDateString(languageLocale(language))}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startEdit(entry)}><Edit3 size={16} /></button>
              <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={remove.isPending} onConfirm={() => remove.mutate(entry.id)}><Trash2 size={16} /></ConfirmAction>
            </div>
          </div>
          {editingId === entry.id && draft && (
            <div className="grid gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <DateField value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
              <input className="input" type="number" step="0.1" value={draft.weightKg} onChange={(event) => setDraft({ ...draft, weightKg: event.target.value })} placeholder={t("weightKg")} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={() => saveEdit(entry.id)}><Save size={16} />{t("save")}</button>
                <button className="btn btn-secondary" onClick={() => { setEditingId(null); setDraft(null); }}><X size={16} />{t("cancel")}</button>
              </div>
              <RequestError error={update.error} />
            </div>
          )}
        </div>
        ))}
        <LoadMore shown={entries.totalLoaded} total={entries.hasNextPage ? entries.totalLoaded + 1 : entries.totalLoaded} onClick={() => entries.fetchNextPage()} />
        </>
      ) : !entries.isLoading && !entries.error ? <EmptyState title={t("emptyTitle")} text={t("emptyWeight")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
