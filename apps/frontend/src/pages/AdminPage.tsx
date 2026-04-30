import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Search, ShieldCheck, TimerReset, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "../api/client";
import type { AdminUser } from "../api/types";
import { AccessBadge } from "../components/AccessBadge";
import { EmptyState } from "../components/EmptyState";
import { useAppStore } from "../store/appStore";
import { languageLocale, useI18n } from "../utils/i18n";

type AccessPatch = { id: string; body: { mode: "MONTHLY"; days: number } | { mode: "LIFETIME" } | { mode: "REVOKE_PAID" } | { mode: "EXPIRE_ALL" } };
type AdminUsersResponse = AdminUser[] | { items: AdminUser[]; nextOffset: number | null };

function adminItems(data: AdminUsersResponse | undefined) {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items;
}

export default function AdminPage() {
  const { language, t } = useI18n();
  const isAdmin = useAppStore((state) => state.isAdmin);
  const queryClient = useQueryClient();
  const [telegramId, setTelegramId] = useState("");
  const [submittedTelegramId, setSubmittedTelegramId] = useState("");
  const queryString = submittedTelegramId ? `?telegramId=${encodeURIComponent(submittedTelegramId)}` : "";
  const users = useQuery({
    queryKey: ["admin-users", submittedTelegramId],
    queryFn: () => api<AdminUsersResponse>(`/api/admin/users${queryString}`),
    enabled: isAdmin
  });
  const updateAccess = useMutation({
    mutationFn: ({ id, body }: AccessPatch) => api<AdminUser>(`/api/admin/users/${id}/access`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedTelegramId(telegramId.trim());
  }

  if (!isAdmin) {
    return (
      <main className="space-y-4">
        <h1 className="page-title">{t("adminPanel")}</h1>
        <section className="panel text-coral">{t("adminForbidden")}</section>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <header className="panel space-y-3 bg-ink text-white dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-mint">PetCare Diary</p>
            <h1 className="mt-1 text-[30px] font-extrabold leading-tight">{t("adminPanel")}</h1>
            <p className="mt-2 text-sm leading-5 text-white/70">{t("adminSubtitle")}</p>
          </div>
          <AccessBadge />
        </div>
      </header>

      <form onSubmit={onSearch} className="panel grid gap-3">
        <label className="section-title" htmlFor="admin-telegram-id">{t("adminSearch")}</label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            id="admin-telegram-id"
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            value={telegramId}
            onChange={(event) => setTelegramId(event.target.value.replace(/\D/g, ""))}
            placeholder="777000001"
          />
          <button className="btn btn-primary px-3" aria-label={t("adminSearch")} title={t("adminSearch")}>
            <Search size={18} />
          </button>
        </div>
        <button type="button" className="btn btn-secondary w-full" onClick={() => { setTelegramId(""); setSubmittedTelegramId(""); }}>
          {t("adminShowRecent")}
        </button>
      </form>

      {users.isLoading && <section className="panel text-center">{t("loading")}</section>}
      {users.error && <section className="panel text-coral">{users.error.message}</section>}
      {!users.isLoading && !adminItems(users.data).length && <EmptyState title={t("emptyTitle")} text={t("adminNoUsers")} />}

      <section className="space-y-2">
        {adminItems(users.data).map((user) => (
          <article className="panel space-y-3" key={user.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-lg font-extrabold">
                  {user.firstName || user.username || `ID ${user.telegramId}`}
                </p>
                <p className="muted">{t("telegramId")}: <span className="font-semibold">{user.telegramId}</span></p>
                <p className="muted">{t("pet")}: <span className="font-semibold">{user.pet?.name ?? t("noPet")}</span></p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {statusLabel(user, t)}
              </span>
            </div>

            <div className="rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
              <p>{t("adminPaidUntil")}: {user.accessUntil ? new Date(user.accessUntil).toLocaleString(languageLocale(language)) : "—"}</p>
              <p>{t("adminTrialUntil")}: {new Date(user.trialEndsAt).toLocaleString(languageLocale(language))}</p>
              <p>{t("adminCreated")}: {new Date(user.createdAt).toLocaleString(languageLocale(language))}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-primary" disabled={updateAccess.isPending} onClick={() => updateAccess.mutate({ id: user.id, body: { mode: "MONTHLY", days: 30 } })}>
                <TimerReset size={16} />{t("adminGrant30")}
              </button>
              <button className="btn btn-secondary" disabled={updateAccess.isPending} onClick={() => updateAccess.mutate({ id: user.id, body: { mode: "LIFETIME" } })}>
                <Crown size={16} />{t("adminGrantLifetime")}
              </button>
              <button className="btn btn-secondary" disabled={updateAccess.isPending} onClick={() => updateAccess.mutate({ id: user.id, body: { mode: "REVOKE_PAID" } })}>
                <ShieldCheck size={16} />{t("adminRevokePaid")}
              </button>
              <button className="btn bg-coral text-white hover:bg-coral/90" disabled={updateAccess.isPending} onClick={() => updateAccess.mutate({ id: user.id, body: { mode: "EXPIRE_ALL" } })}>
                <XCircle size={16} />{t("adminExpireAll")}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function statusLabel(user: AdminUser, t: ReturnType<typeof useI18n>["t"]) {
  if (user.accessStatus === "admin") return t("adminAccess");
  if (user.accessStatus === "lifetime") return t("lifetime");
  if (user.accessStatus === "active_monthly") return t("monthlyActive");
  if (user.accessStatus === "trial") {
    const endsAt = user.accessEndsAt ?? user.trialEndsAt;
    const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
    return t("trialDays", { days });
  }
  return t("expired");
}
