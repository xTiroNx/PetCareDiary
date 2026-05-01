import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Edit3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import { ConfirmAction } from "../components/ConfirmAction";
import { DateTimeFields } from "../components/DateTimeFields";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { localDateTimeInputValue } from "../utils/dateTime";
import { languageLocale, useI18n } from "../utils/i18n";
import { telegramSelection, telegramSuccess } from "../utils/telegram";

type ReminderRepeatRule = "" | "daily" | "weekly" | "monthly";
type Reminder = {
  id: string;
  type: string;
  title: string;
  time: string;
  repeatRule?: ReminderRepeatRule | null;
  active: boolean;
  lastSentAt?: string | null;
  lastDeliveryError?: string | null;
};

export default function RemindersPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const queryClient = useQueryClient();
  const now = localDateTimeInputValue();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const reminderLabels: Record<string, string> = { FEEDING: t("reminderTypeFeeding"), MEDICINE: t("reminderTypeMedicine"), WEIGHT: t("reminderTypeWeight"), VET: t("reminderTypeVet"), OTHER: t("other") };
  const repeatLabels: Record<string, string> = { daily: t("repeatDaily"), weekly: t("repeatWeekly"), monthly: t("repeatMonthly") };
  const reminders = usePaginatedApi<Reminder>(["reminders", pet?.id], `/api/reminders?petId=${pet?.id ?? ""}`, Boolean(pet));
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/reminders", { method: "POST", body: jsonBody(body) }),
    onSuccess: () => {
      telegramSuccess();
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
    }
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/reminders/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => {
      setEditingId(null);
      setDraft({});
      telegramSuccess();
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/reminders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      telegramSuccess();
      queryClient.invalidateQueries({ queryKey: ["reminders", pet?.id] });
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    add.mutate({
      ...data,
      petId: pet!.id,
      time: new Date(String(data.time)).toISOString(),
      repeatRule: data.repeatRule ? String(data.repeatRule) : null
    });
  }

  function startEdit(item: Reminder) {
    telegramSelection();
    setEditingId(item.id);
    setDraft({
      type: item.type,
      title: item.title,
      time: localDateTimeInputValue(new Date(item.time)),
      repeatRule: item.repeatRule ?? "",
      active: item.active
    });
  }

  function saveReminder(id: string) {
    update.mutate({
      id,
      body: {
        petId: pet!.id,
        type: draft.type,
        title: draft.title,
        time: new Date(String(draft.time)).toISOString(),
        repeatRule: draft.repeatRule || null,
        active: Boolean(draft.active)
      }
    });
  }

  function updateDraft(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="page-title">{t("reminders")}</h1>
      </header>
      <form onSubmit={onSubmit} className="panel grid gap-3">
        <div className="flex items-center gap-2">
          <BellPlus size={18} className="text-mint" />
          <p className="section-title">{t("create")}</p>
        </div>
        <SelectField name="type" defaultValue="FEEDING">
          <option value="FEEDING">{t("reminderTypeFeeding")}</option><option value="MEDICINE">{t("reminderTypeMedicine")}</option><option value="WEIGHT">{t("reminderTypeWeight")}</option><option value="VET">{t("reminderTypeVet")}</option><option value="OTHER">{t("other")}</option>
        </SelectField>
        <input className="input" name="title" placeholder={t("title")} required />
        <DateTimeFields name="time" defaultValue={now} required />
        <SelectField name="repeatRule" defaultValue="">
          <option value="">{t("repeatNone")}</option>
          <option value="daily">{t("repeatDaily")}</option>
          <option value="weekly">{t("repeatWeekly")}</option>
          <option value="monthly">{t("repeatMonthly")}</option>
        </SelectField>
        <button className="btn btn-primary">{t("create")}</button>
        <RequestError error={add.error} />
      </form>
      {reminders.isLoading && <div className="panel text-center">{t("loading")}</div>}
      {reminders.error && <div className="panel text-coral"><RequestError error={reminders.error} /></div>}
      {reminders.items.length ? (
        <>
        {reminders.items.map((item) => (
        <div className="panel" key={item.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-zinc-500">{reminderLabels[item.type] ?? item.type} · {new Date(item.time).toLocaleString(languageLocale(language))}</p>
              {item.repeatRule && <p className="text-sm">{repeatLabels[item.repeatRule] ?? item.repeatRule}</p>}
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                {item.lastDeliveryError ? t("deliveryError") : item.active ? t("active") : item.lastSentAt ? t("sent") : t("inactive")}
              </p>
              {item.lastDeliveryError && <p className="mt-1 text-xs text-coral">{item.lastDeliveryError}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startEdit(item)}><Edit3 size={16} /></button>
              <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={remove.isPending} onConfirm={() => remove.mutate(item.id)}><Trash2 size={16} /></ConfirmAction>
            </div>
          </div>
          {editingId === item.id && (
            <div className="mt-3 grid gap-2">
              <SelectField value={String(draft.type ?? "FEEDING")} onChange={(event) => updateDraft("type", event.target.value)}>
                <option value="FEEDING">{t("reminderTypeFeeding")}</option><option value="MEDICINE">{t("reminderTypeMedicine")}</option><option value="WEIGHT">{t("reminderTypeWeight")}</option><option value="VET">{t("reminderTypeVet")}</option><option value="OTHER">{t("other")}</option>
              </SelectField>
              <input className="input" value={String(draft.title ?? "")} onChange={(event) => updateDraft("title", event.target.value)} placeholder={t("title")} />
              <DateTimeFields name="time" value={String(draft.time ?? "")} onChange={(time) => updateDraft("time", time)} />
              <SelectField value={String(draft.repeatRule ?? "")} onChange={(event) => updateDraft("repeatRule", event.target.value)}>
                <option value="">{t("repeatNone")}</option>
                <option value="daily">{t("repeatDaily")}</option>
                <option value="weekly">{t("repeatWeekly")}</option>
                <option value="monthly">{t("repeatMonthly")}</option>
              </SelectField>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(draft.active)} onChange={(event) => updateDraft("active", event.target.checked)} />{t("active")}</label>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" disabled={update.isPending} onClick={() => saveReminder(item.id)}><Save size={16} />{t("save")}</button>
                <button className="btn btn-secondary" onClick={() => { setEditingId(null); setDraft({}); }}><X size={16} />{t("cancel")}</button>
              </div>
              <RequestError error={update.error} />
            </div>
          )}
        </div>
        ))}
        <LoadMore shown={reminders.totalLoaded} total={reminders.hasNextPage ? reminders.totalLoaded + 1 : reminders.totalLoaded} onClick={() => reminders.fetchNextPage()} />
        </>
      ) : !reminders.isLoading && !reminders.error ? <EmptyState title={t("emptyTitle")} text={t("emptyReminders")} /> : null}
      <RequestError error={remove.error} />
    </main>
  );
}
