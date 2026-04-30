import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type FeedingEntry = { id: string; dateTime: string; foodType: string; amount: string; note?: string };
type FeedingDraft = { dateTime: string; foodType: string; amount: string; note: string };

export default function FeedingPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const now = localDateTimeInputValue();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FeedingDraft | null>(null);
  const foodLabels: Record<string, string> = { DRY: t("dryFood"), WET: t("wetFood"), NATURAL: t("naturalFood"), TREAT: t("treat"), OTHER: t("other") };
  const entries = usePaginatedApi<FeedingEntry>(["feeding", pet?.id], `/api/feeding?petId=${pet?.id ?? ""}`, Boolean(pet));
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/feeding", { method: "POST", body: jsonBody(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feeding", pet?.id] })
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/feeding/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["feeding", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/feeding/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feeding", pet?.id] })
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({ ...data, petId: pet!.id, dateTime: new Date(String(data.dateTime)).toISOString() });
    event.currentTarget.reset();
  }

  function startEdit(entry: FeedingEntry) {
    setEditingId(entry.id);
    setDraft({
      dateTime: localDateTimeInputValue(new Date(entry.dateTime)),
      foodType: entry.foodType,
      amount: entry.amount,
      note: entry.note ?? ""
    });
  }

  function saveEdit(id: string) {
    if (!draft) return;
    update.mutate({
      id,
      body: {
        ...draft,
        petId: pet!.id,
        dateTime: new Date(draft.dateTime).toISOString()
      }
    });
  }

  return (
    <main className="space-y-4">
      <h1 className="page-title">{t("feedingTitle")}</h1>
      <form onSubmit={onSubmit} className="panel grid gap-3">
        <input className="input" name="dateTime" type="datetime-local" defaultValue={now} required />
        <SelectField name="foodType" defaultValue="DRY">
          <option value="DRY">{t("dryFood")}</option><option value="WET">{t("wetFood")}</option><option value="NATURAL">{t("naturalFood")}</option><option value="TREAT">{t("treat")}</option><option value="OTHER">{t("other")}</option>
        </SelectField>
        <input className="input" name="amount" placeholder={t("amount")} required />
        <textarea className="input" name="note" placeholder={t("note")} />
        <button className="btn btn-primary">{t("add")}</button>
        <RequestError error={add.error} />
      </form>
      {entries.isLoading && <div className="panel text-center">{t("loading")}</div>}
      {entries.error && <div className="panel text-coral"><RequestError error={entries.error} /></div>}
      {entries.items.length ? (
        <>
        {entries.items.map((entry) => (
        <div className="panel space-y-3" key={entry.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{entry.amount} · {foodLabels[entry.foodType] ?? entry.foodType}</p>
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
              <input className="input" type="datetime-local" value={draft.dateTime} onChange={(event) => setDraft({ ...draft, dateTime: event.target.value })} />
              <SelectField value={draft.foodType} onChange={(event) => setDraft({ ...draft, foodType: event.target.value })}>
                <option value="DRY">{t("dryFood")}</option><option value="WET">{t("wetFood")}</option><option value="NATURAL">{t("naturalFood")}</option><option value="TREAT">{t("treat")}</option><option value="OTHER">{t("other")}</option>
              </SelectField>
              <input className="input" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder={t("amount")} />
              <textarea className="input" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={t("note")} />
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
      ) : !entries.isLoading && !entries.error ? <EmptyState title={t("emptyTitle")} text={t("emptyFeeding")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
