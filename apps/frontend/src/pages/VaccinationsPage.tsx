import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateField } from "../components/DateField";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type ProcedureType = "VACCINE" | "DEWORMING" | "FLEA_TICK" | "OTHER";
type VaccinationEntry = {
  id: string;
  procedureType: ProcedureType | string;
  title?: string | null;
  name?: string | null;
  productName?: string | null;
  date: string;
  nextDueDate?: string | null;
  note?: string | null;
  createdReminder?: boolean;
};
type VaccinationDraft = {
  procedureType: ProcedureType;
  title: string;
  procedureDate: string;
  nextDueDate: string;
  createReminder: boolean;
  note: string;
};

function localDateToUtcIso(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function titleOf(entry: VaccinationEntry) {
  return entry.title ?? entry.name ?? entry.productName ?? "";
}

export default function VaccinationsPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VaccinationDraft | null>(null);
  const typeLabels: Record<string, string> = {
    VACCINE: t("procedureVaccine"),
    DEWORMING: t("procedureDeworming"),
    FLEA_TICK: t("procedureFleaTick"),
    OTHER: t("procedureOther")
  };
  const entries = usePaginatedApi<VaccinationEntry>(["vaccinations", pet?.id], `/api/vaccinations?petId=${pet?.id ?? ""}`, Boolean(pet));

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/vaccinations", { method: "POST", body: jsonBody(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaccinations", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
    }
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/vaccinations/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["vaccinations", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/vaccinations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaccinations", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", pet?.id] });
    }
  });

  function bodyFromDraft(value: VaccinationDraft) {
    return {
      petId: pet!.id,
      procedureType: value.procedureType,
      title: value.title,
      date: localDateToUtcIso(value.procedureDate),
      nextDueDate: localDateToUtcIso(value.nextDueDate),
      createReminder: value.createReminder,
      note: value.note || null
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({
      petId: pet!.id,
      procedureType: String(data.procedureType),
      title: String(data.title),
      date: localDateToUtcIso(String(data.procedureDate)),
      nextDueDate: localDateToUtcIso(String(data.nextDueDate || "")),
      createReminder: data.createReminder === "on",
      note: String(data.note || "") || null
    });
    event.currentTarget.reset();
  }

  function startEdit(entry: VaccinationEntry) {
    setEditingId(entry.id);
    setDraft({
      procedureType: (entry.procedureType as ProcedureType) || "VACCINE",
      title: titleOf(entry),
      procedureDate: localDateInputValue(new Date(entry.date)),
      nextDueDate: entry.nextDueDate ? localDateInputValue(new Date(entry.nextDueDate)) : "",
      createReminder: false,
      note: entry.note ?? ""
    });
  }

  function saveEdit(id: string) {
    if (!draft) return;
    update.mutate({ id, body: bodyFromDraft(draft) });
  }

  return (
    <main className="space-y-4">
      <h1 className="page-title">{t("vaccinationsTitle")}</h1>
      <form onSubmit={onSubmit} className="panel grid gap-3">
        <SelectField name="procedureType" defaultValue="VACCINE">
          <option value="VACCINE">{t("procedureVaccine")}</option>
          <option value="DEWORMING">{t("procedureDeworming")}</option>
          <option value="FLEA_TICK">{t("procedureFleaTick")}</option>
          <option value="OTHER">{t("procedureOther")}</option>
        </SelectField>
        <input className="input" name="title" placeholder={t("procedureName")} required />
        <DateField name="procedureDate" label={t("procedureDate")} defaultValue={localDateInputValue()} required />
        <DateField name="nextDueDate" label={t("nextDueDate")} allowEmpty />
        <label className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-3 text-sm font-semibold dark:bg-zinc-950">
          <input name="createReminder" type="checkbox" />
          {t("createReminder")}
        </label>
        <textarea className="input" name="note" placeholder={t("note")} />
        <button className="btn btn-primary"><CalendarCheck size={17} />{t("add")}</button>
        <RequestError error={add.error} />
      </form>

      {entries.isLoading && <div className="panel text-center">{t("loading")}</div>}
      {entries.error && <div className="panel text-coral"><RequestError error={entries.error} /></div>}
      {entries.items.length ? (
        <>
          {entries.items.map((entry) => (
            <div className="panel space-y-3" key={entry.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{titleOf(entry) || typeLabels[entry.procedureType] || entry.procedureType}</p>
                  <p className="text-sm text-zinc-500">{typeLabels[entry.procedureType] ?? entry.procedureType} · {new Date(entry.date).toLocaleDateString(languageLocale(language))}</p>
                  {entry.nextDueDate && <p className="mt-1 text-sm font-semibold text-mint">{t("nextTreatment")}: {new Date(entry.nextDueDate).toLocaleDateString(languageLocale(language))}</p>}
                  {entry.note && <p className="mt-1 text-sm">{entry.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startEdit(entry)}><Edit3 size={16} /></button>
                  <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={remove.isPending} onConfirm={() => remove.mutate(entry.id)}><Trash2 size={16} /></ConfirmAction>
                </div>
              </div>
              {editingId === entry.id && draft && (
                <div className="grid gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <SelectField value={draft.procedureType} onChange={(event) => setDraft({ ...draft, procedureType: event.target.value as ProcedureType })}>
                    <option value="VACCINE">{t("procedureVaccine")}</option>
                    <option value="DEWORMING">{t("procedureDeworming")}</option>
                    <option value="FLEA_TICK">{t("procedureFleaTick")}</option>
                    <option value="OTHER">{t("procedureOther")}</option>
                  </SelectField>
                  <input className="input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t("procedureName")} />
                  <DateField label={t("procedureDate")} value={draft.procedureDate} onChange={(procedureDate) => setDraft({ ...draft, procedureDate })} />
                  <DateField label={t("nextDueDate")} value={draft.nextDueDate} onChange={(nextDueDate) => setDraft({ ...draft, nextDueDate })} allowEmpty />
                  <label className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-3 text-sm font-semibold dark:bg-zinc-950">
                    <input type="checkbox" checked={draft.createReminder} onChange={(event) => setDraft({ ...draft, createReminder: event.target.checked })} />
                    {t("createReminder")}
                  </label>
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
      ) : !entries.isLoading && !entries.error ? <EmptyState title={t("emptyTitle")} text={t("emptyVaccinations")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
