import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type WeightEntry = { id: string; date: string; weightKg: string };
type WeightDraft = { date: string; weightKg: string };

export default function WeightPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WeightDraft | null>(null);
  const entries = usePaginatedApi<WeightEntry>(["weights", pet?.id], `/api/weights?petId=${pet?.id ?? ""}`, Boolean(pet));
  const add = useMutation({ mutationFn: (body: Record<string, unknown>) => api("/api/weights", { method: "POST", body: jsonBody(body) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weights", pet?.id] }) });
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
  const values = [...entries.items].reverse();
  const max = Math.max(1, ...values.map((entry) => Number(entry.weightKg)));

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
        <input className="input date-input" name="date" type="date" defaultValue={localDateInputValue()} required />
        <input className="input" name="weightKg" type="number" step="0.1" placeholder={t("weightKg")} required />
        <button className="btn btn-primary">{t("add")}</button>
        <RequestError error={add.error} />
      </form>
      <section className="panel">
        <h2 className="section-title">{t("weightChart")}</h2>
        <div className="mt-4 flex h-32 items-end gap-2">
          {values.map((entry) => <div key={entry.id} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-mint" style={{ height: `${Math.max(8, (Number(entry.weightKg) / max) * 100)}%` }} /><span className="text-[10px]">{Number(entry.weightKg).toFixed(1)}</span></div>)}
        </div>
      </section>
      {entries.isLoading && <div className="panel text-center">{t("loading")}</div>}
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
              <input className="input date-input" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
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
