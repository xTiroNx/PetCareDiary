import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplets, Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ActionAttachmentPicker } from "../components/ActionAttachmentPicker";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateTimeFields } from "../components/DateTimeFields";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { SkeletonBlock } from "../components/SkeletonBlock";
import { SuccessFlash } from "../components/SuccessFlash";
import { useEntryAttachmentUpload } from "../hooks/useEntryAttachmentUpload";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useSuccessFlash } from "../hooks/useSuccessFlash";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputToUtcIso, localDateTimeInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type WaterEntry = { id: string; dateTime: string; amountMl: number | string; note?: string | null };
type WaterDraft = { dateTime: string; amountMl: string; note: string };
type WaterAnalytics = {
  totalMl?: number;
  averageMl?: number;
  entriesCount?: number;
  days?: number;
  warnings?: string[];
  byDay?: Array<{ date: string; totalMl: number }>;
};
type WaterPeriod = "7" | "14" | "30" | "90";

function waterRange(days: WaterPeriod) {
  const to = new Date();
  const from = new Date(to.getTime() - (Number(days) - 1) * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function waterQuery(petId: string, days: WaterPeriod) {
  const range = waterRange(days);
  const params = new URLSearchParams({ petId, from: range.from, to: range.to });
  return params.toString();
}

function WaterBars({ values }: { values: Array<{ date: string; totalMl: number }> }) {
  const max = Math.max(1, ...values.map((item) => Number(item.totalMl) || 0));
  return (
    <div className="mt-3 flex h-24 items-end gap-1.5 rounded-lg bg-zinc-50 px-2 py-3 dark:bg-zinc-950">
      {values.slice(-14).map((item) => (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={item.date}>
          <div
            className="w-full rounded-full bg-mint"
            style={{ height: `${Math.max(10, (Number(item.totalMl) / max) * 68)}px`, opacity: 0.45 + (Number(item.totalMl) / max) * 0.45 }}
            title={`${item.date}: ${item.totalMl} ml`}
          />
        </div>
      ))}
    </div>
  );
}

export default function WaterPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const queryClient = useQueryClient();
  const attachment = useEntryAttachmentUpload("WATER", pet?.id, t);
  const saved = useSuccessFlash();
  const [period, setPeriod] = useState<WaterPeriod>("7");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WaterDraft | null>(null);
  const listPath = pet ? `/api/water?${waterQuery(pet.id, period)}` : "/api/water";
  const entries = usePaginatedApi<WaterEntry>(["water", pet?.id, period], listPath, Boolean(pet));
  const analytics = useQuery({
    queryKey: ["water-analytics", pet?.id, period],
    queryFn: () => api<WaterAnalytics>(`/api/water/analytics?${new URLSearchParams({ petId: pet!.id, days: period })}`),
    enabled: Boolean(pet)
  });

  const chartValues = useMemo(() => analytics.data?.byDay ?? [], [analytics.data?.byDay]);

  const add = useMutation<WaterEntry, Error, Record<string, unknown>>({
    mutationFn: (body) => api<WaterEntry>("/api/water", { method: "POST", body: jsonBody(body) }),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["water", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["water-analytics", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
      await attachment.uploadForEntry(created.id);
      saved.show();
    }
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/water/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["water", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["water-analytics", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/water/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["water-analytics", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({
      petId: pet!.id,
      dateTime: localDateTimeInputToUtcIso(String(data.dateTime)),
      amountMl: Number(data.amountMl),
      note: String(data.note || "") || null
    });
    event.currentTarget.reset();
  }

  function startEdit(entry: WaterEntry) {
    setEditingId(entry.id);
    setDraft({
      dateTime: localDateTimeInputValue(new Date(entry.dateTime)),
      amountMl: String(entry.amountMl),
      note: entry.note ?? ""
    });
  }

  function saveEdit(id: string) {
    if (!draft) return;
    update.mutate({
      id,
      body: {
        petId: pet!.id,
        dateTime: localDateTimeInputToUtcIso(draft.dateTime),
        amountMl: Number(draft.amountMl),
        note: draft.note || null
      }
    });
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">{t("waterTitle")}</h1>
        <SelectField wrapperClassName="w-32 shrink-0" value={period} onChange={(event) => setPeriod(event.target.value as WaterPeriod)}>
          <option value="7">{t("days7")}</option>
          <option value="14">{t("days14")}</option>
          <option value="30">{t("days30")}</option>
          <option value="90">{t("days90")}</option>
        </SelectField>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-3">
        <DateTimeFields defaultValue={localDateTimeInputValue()} required />
        <input className="input" name="amountMl" type="number" inputMode="numeric" min="1" placeholder={t("waterVolumeMl")} required />
        <textarea className="input" name="note" placeholder={t("note")} />
        <ActionAttachmentPicker visible={isAdmin} file={attachment.file} disabled={add.isPending || attachment.isUploading} isPreparing={attachment.isUploading} uploadError={attachment.error} onFileChange={attachment.selectFile} onClear={attachment.clearFile} />
        <button className="btn btn-primary" disabled={add.isPending || attachment.isUploading}><Droplets size={17} />{t("add")}</button>
        <SuccessFlash show={saved.visible} />
        <RequestError error={add.error} />
      </form>

      <section className="panel">
        <h2 className="section-title">{t("waterSummary")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-extrabold">{analytics.data?.totalMl ?? 0}</p><p className="text-xs font-semibold text-zinc-500">ml</p></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-extrabold">{analytics.data?.averageMl ?? 0}</p><p className="text-xs font-semibold text-zinc-500">{t("waterAverage")}</p></div>
        </div>
        {chartValues.length ? <WaterBars values={chartValues} /> : null}
        {analytics.data?.warnings?.length ? (
          <ul className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            {analytics.data.warnings.map((warning) => <li className="rounded-lg bg-coral/10 p-2" key={warning}>{warning}</li>)}
          </ul>
        ) : <p className="muted mt-3">{t("waterHint")}</p>}
      </section>

      {entries.isLoading && <SkeletonBlock rows={3} />}
      {entries.error && <div className="panel text-coral"><RequestError error={entries.error} /></div>}
      {entries.items.length ? (
        <>
          {entries.items.map((entry) => (
            <div className="panel space-y-3" key={entry.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{entry.amountMl} ml</p>
                  <p className="text-sm text-zinc-500">{new Date(entry.dateTime).toLocaleString(languageLocale(language))}</p>
                  {entry.note && <p className="mt-1 text-sm">{entry.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startEdit(entry)}><Edit3 size={16} /></button>
                  <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={remove.isPending} onConfirm={() => remove.mutate(entry.id)}><Trash2 size={16} /></ConfirmAction>
                </div>
              </div>
              {editingId === entry.id && draft && (
                <div className="grid gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <DateTimeFields value={draft.dateTime} onChange={(dateTime) => setDraft({ ...draft, dateTime })} />
                  <input className="input" type="number" inputMode="numeric" min="1" value={draft.amountMl} onChange={(event) => setDraft({ ...draft, amountMl: event.target.value })} placeholder={t("waterVolumeMl")} />
                  <textarea className="input" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={t("note")} />
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn btn-primary" disabled={update.isPending} onClick={() => saveEdit(entry.id)}><Save size={16} />{t("save")}</button>
                    <button className="btn btn-secondary" onClick={() => { setEditingId(null); setDraft(null); }}><X size={16} />{t("cancel")}</button>
                  </div>
                  <RequestError error={update.error} />
                </div>
              )}
            </div>
          ))}
          <LoadMore shown={entries.totalLoaded} total={entries.hasNextPage ? entries.totalLoaded + 1 : entries.totalLoaded} onClick={() => entries.fetchNextPage()} />
        </>
      ) : !entries.isLoading && !entries.error ? <EmptyState title={t("emptyTitle")} text={t("emptyWater")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
