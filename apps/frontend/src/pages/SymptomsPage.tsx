import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateTimeFields } from "../components/DateTimeFields";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { SeverityScale } from "../components/SeverityScale";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";

type SymptomEntry = { id: string; dateTime: string; symptomType: string; severity: number; note?: string };
type Analytics = { symptomType: string; count: number };
type SymptomDraft = { dateTime: string; symptomType: string; severity: string; note: string };

export default function SymptomsPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const now = localDateTimeInputValue();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SymptomDraft | null>(null);
  const symptomLabels: Record<string, string> = { VOMITING: t("vomiting"), YELLOW_VOMIT: t("yellowVomit"), NO_APPETITE: t("noAppetite"), DIARRHEA: t("diarrhea"), CONSTIPATION: t("constipation"), LETHARGY: t("lethargy"), PAIN: t("pain"), OTHER: t("other") };
  const entries = usePaginatedApi<SymptomEntry>(["symptoms", pet?.id], `/api/symptoms?petId=${pet?.id ?? ""}`, Boolean(pet));
  const analytics = useQuery({ queryKey: ["symptoms-analytics", pet?.id], queryFn: () => api<Analytics[]>(`/api/symptoms/analytics?petId=${pet!.id}`), enabled: Boolean(pet) });
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/symptoms", { method: "POST", body: jsonBody(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["symptoms", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["symptoms-analytics", pet?.id] });
    }
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/symptoms/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["symptoms", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["symptoms-analytics", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/symptoms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["symptoms", pet?.id] });
      queryClient.invalidateQueries({ queryKey: ["symptoms-analytics", pet?.id] });
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({ ...data, petId: pet!.id, severity: Number(data.severity), dateTime: new Date(String(data.dateTime)).toISOString() });
    event.currentTarget.reset();
  }

  function startEdit(entry: SymptomEntry) {
    setEditingId(entry.id);
    setDraft({
      dateTime: localDateTimeInputValue(new Date(entry.dateTime)),
      symptomType: entry.symptomType,
      severity: String(entry.severity),
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
        severity: Number(draft.severity),
        dateTime: new Date(draft.dateTime).toISOString()
      }
    });
  }

  return (
    <main className="space-y-4">
      <h1 className="page-title">{t("symptomsTitle")}</h1>
      <form onSubmit={onSubmit} className="panel grid gap-3">
        <DateTimeFields defaultValue={now} required />
        <SelectField name="symptomType" defaultValue="VOMITING">
          <option value="VOMITING">{t("vomiting")}</option><option value="YELLOW_VOMIT">{t("yellowVomit")}</option><option value="NO_APPETITE">{t("noAppetite")}</option><option value="DIARRHEA">{t("diarrhea")}</option><option value="CONSTIPATION">{t("constipation")}</option><option value="LETHARGY">{t("lethargy")}</option><option value="PAIN">{t("pain")}</option><option value="OTHER">{t("other")}</option>
        </SelectField>
        <SeverityScale defaultValue="1" />
        <textarea className="input" name="note" placeholder={t("comment")} />
        <button className="btn btn-primary">{t("add")}</button>
        <RequestError error={add.error} />
      </form>
      <section className="panel"><h2 className="section-title">{t("last7Days")}</h2><div className="mt-2 flex flex-wrap gap-2">{analytics.data?.length ? analytics.data.map((item) => <span className="rounded-full bg-skysoft px-3 py-1 text-xs font-semibold text-ink" key={item.symptomType}>{symptomLabels[item.symptomType] ?? item.symptomType}: {item.count}</span>) : <span className="text-sm text-zinc-500">{t("noRepeats")}</span>}</div></section>
      {entries.isLoading && <div className="panel text-center">{t("loading")}</div>}
      {entries.error && <div className="panel text-coral"><RequestError error={entries.error} /></div>}
      {entries.items.length ? (
        <>
        {entries.items.map((entry) => (
        <div className="panel space-y-3" key={entry.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{symptomLabels[entry.symptomType] ?? entry.symptomType} · {t("severity")} {entry.severity}/5</p>
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
              <SelectField value={draft.symptomType} onChange={(event) => setDraft({ ...draft, symptomType: event.target.value })}>
                <option value="VOMITING">{t("vomiting")}</option><option value="YELLOW_VOMIT">{t("yellowVomit")}</option><option value="NO_APPETITE">{t("noAppetite")}</option><option value="DIARRHEA">{t("diarrhea")}</option><option value="CONSTIPATION">{t("constipation")}</option><option value="LETHARGY">{t("lethargy")}</option><option value="PAIN">{t("pain")}</option><option value="OTHER">{t("other")}</option>
              </SelectField>
              <SeverityScale value={draft.severity} onChange={(severity) => setDraft({ ...draft, severity })} />
              <textarea className="input" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={t("comment")} />
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
      ) : !entries.isLoading && !entries.error ? <EmptyState title={t("emptyTitle")} text={t("emptySymptoms")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
