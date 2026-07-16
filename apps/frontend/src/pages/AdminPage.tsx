import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Crown, Eye, RefreshCw, Search, ShieldCheck, TimerReset, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminAnalyticsEvents, getAdminAnalyticsSummary } from "../api/analytics";
import type { AnalyticsDailyRow, AnalyticsEvent, AnalyticsLanguageBreakdown, AnalyticsPeriod, AnalyticsPlatformBreakdown, AnalyticsSourceBreakdown, AnalyticsSummary } from "../api/analytics";
import { api, jsonBody } from "../api/client";
import type { AdminUser } from "../api/types";
import { AccessBadge } from "../components/AccessBadge";
import { AdminVoiceCommand } from "../components/AdminVoiceCommand";
import { EmptyState } from "../components/EmptyState";
import { LoadMore } from "../components/LoadMore";
import { SkeletonBlock } from "../components/SkeletonBlock";
import { usePaginatedApi } from "../hooks/usePaginatedApi";
import { useAppStore } from "../store/appStore";
import { languageLocale, useI18n } from "../utils/i18n";

type AccessPatch = { id: string; body: { mode: "MONTHLY"; days: number } | { mode: "LIFETIME" } | { mode: "REVOKE_PAID" } | { mode: "EXPIRE_ALL" } };
type AdminUsersResponse = { items: AdminUser[]; nextOffset: number | null };
const analyticsPeriods: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "all", label: "Всё время" }
];

export default function AdminPage() {
  const { language, t } = useI18n();
  const isAdmin = useAppStore((state) => state.isAdmin);
  const queryClient = useQueryClient();
  const [telegramId, setTelegramId] = useState("");
  const [submittedTelegramId, setSubmittedTelegramId] = useState("");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("30d");
  const isSearching = Boolean(submittedTelegramId);
  const recentUsers = usePaginatedApi<AdminUser>(["admin-users", "recent"], "/api/admin/users", isAdmin && !isSearching, 20);
  const searchUsers = useQuery({
    queryKey: ["admin-users", "search", submittedTelegramId],
    queryFn: () => api<AdminUsersResponse>(`/api/admin/users?telegramId=${encodeURIComponent(submittedTelegramId)}`),
    enabled: isAdmin && isSearching
  });
  const users = isSearching ? searchUsers.data?.items ?? [] : recentUsers.items;
  const isLoading = isSearching ? searchUsers.isLoading : recentUsers.isLoading;
  const error = isSearching ? searchUsers.error : recentUsers.error;
  const updateAccess = useMutation({
    mutationFn: ({ id, body }: AccessPatch) => api<AdminUser>(`/api/admin/users/${id}/access`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  });
  const analyticsSummary = useQuery({
    queryKey: ["admin-analytics-summary", analyticsPeriod],
    queryFn: () => getAdminAnalyticsSummary(analyticsPeriod),
    enabled: isAdmin
  });
  const analyticsEvents = useQuery({
    queryKey: ["admin-analytics-events", analyticsPeriod, 100],
    queryFn: () => getAdminAnalyticsEvents(analyticsPeriod, 100),
    enabled: isAdmin
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedTelegramId(telegramId.trim());
  }

  function showRecentUsers() {
    setTelegramId("");
    setSubmittedTelegramId("");
    queryClient.removeQueries({ queryKey: ["admin-users", "recent"] });
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

      <Link className="btn btn-secondary w-full" to="/admin/first-visit-preview">
        <Eye size={18} />Предпросмотр первого входа
      </Link>

      <AdminVoiceCommand />

      <AdminAnalyticsPanel
        events={analyticsEvents.data?.events ?? []}
        eventsError={analyticsEvents.error}
        eventsLoading={analyticsEvents.isLoading}
        onPeriodChange={setAnalyticsPeriod}
        onRefresh={() => {
          analyticsSummary.refetch();
          analyticsEvents.refetch();
        }}
        period={analyticsPeriod}
        summary={analyticsSummary.data}
        summaryError={analyticsSummary.error}
        summaryLoading={analyticsSummary.isLoading}
      />

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
        <button type="button" className="btn btn-secondary w-full" onClick={showRecentUsers}>
          {t("adminShowRecent")}
        </button>
      </form>

      {isLoading && <SkeletonBlock rows={5} />}
      {error && <section className="panel text-coral">{error.message}</section>}
      {!isLoading && !users.length && <EmptyState title={t("emptyTitle")} text={t("adminNoUsers")} />}

      <section className="space-y-2">
        {users.map((user) => (
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
        {!isSearching && recentUsers.hasNextPage ? (
          <LoadMore
            shown={recentUsers.totalLoaded}
            total={recentUsers.totalLoaded + 1}
            onClick={() => recentUsers.fetchNextPage()}
          />
        ) : null}
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

function AdminAnalyticsPanel({
  events,
  eventsError,
  eventsLoading,
  onPeriodChange,
  onRefresh,
  period,
  summary,
  summaryError,
  summaryLoading
}: {
  events: AnalyticsEvent[];
  eventsError: Error | null;
  eventsLoading: boolean;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onRefresh: () => void;
  period: AnalyticsPeriod;
  summary?: AnalyticsSummary;
  summaryError: Error | null;
  summaryLoading: boolean;
}) {
  return (
    <section className="panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold text-mint">
            <BarChart3 size={17} /> Аналитика
          </p>
          <p className="muted mt-1">Языки Telegram, платформы и affiliate/source качество.</p>
        </div>
        <button className="btn btn-secondary shrink-0 px-3" type="button" onClick={onRefresh} aria-label="Обновить аналитику" title="Обновить аналитику">
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {analyticsPeriods.map((item) => (
          <button
            className={item.value === period ? "btn btn-primary" : "btn btn-secondary"}
            key={item.value}
            type="button"
            onClick={() => onPeriodChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-mint/20 bg-mint/5 p-3 text-xs leading-5 text-zinc-600 dark:bg-mint/10 dark:text-zinc-300">
        <p className="font-extrabold text-mint">Примеры source/start_param для теста:</p>
        <p className="mt-1 break-words">aff_en · aff_fr · aff_es · aff_ru · aff_de · aff_it · telegram_ads · profile_button · direct</p>
      </div>

      {summaryLoading && <SkeletonBlock rows={5} className="border-0 bg-transparent p-0 shadow-none" />}
      {summaryError && <div className="rounded-lg bg-coral/10 p-3 text-sm font-semibold text-coral">{summaryError.message}</div>}
      {!summaryLoading && !summaryError && !summary ? <EmptyState title="Пока нет данных" text="Аналитика появится после первых событий." /> : null}

      {summary ? (
        <>
          <KpiGrid summary={summary} />
          <FunnelBlock summary={summary} />
          <LanguageBreakdownTable rows={summary.breakdowns.languages} />
          <PlatformBreakdownTable rows={summary.breakdowns.platforms} />
          <SourceBreakdownTable rows={summary.breakdowns.sources} />
          <EventsByDayTable rows={summary.eventsByDay} />
          <TopEventsBlock summary={summary} />
        </>
      ) : null}

      <LatestEventsTable events={events} error={eventsError} loading={eventsLoading} />
    </section>
  );
}

function KpiGrid({ summary }: { summary: AnalyticsSummary }) {
  const cards = [
    ["Всего пользователей", summary.totals.users],
    ["Создали питомца", summary.totals.usersWithPets],
    ["Сделали первую запись", summary.totals.usersWithEntries],
    ["Активных платных", summary.totals.activePaidUsers],
    ["Кол-во оплат", summary.totals.paymentsCount],
    ["Stars получено", summary.totals.paymentsStars]
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map(([label, value]) => (
        <div className="rounded-lg bg-zinc-50 p-3 text-center dark:bg-zinc-950" key={label}>
          <p className="text-2xl font-extrabold">{formatNumber(value)}</p>
          <p className="mt-1 text-[11px] font-bold uppercase leading-tight text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

function FunnelBlock({ summary }: { summary: AnalyticsSummary }) {
  const maxCount = Math.max(1, ...summary.funnel.map((step) => step.count));
  return (
    <div className="space-y-2">
      <h2 className="section-title">Воронка</h2>
      {summary.funnel.map((step) => (
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950" key={step.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold">{step.label}</span>
            <span className="shrink-0 font-extrabold">{formatNumber(step.count)}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-mint" style={{ width: `${Math.max(3, (step.count / maxCount) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">Конверсия от предыдущего: {formatPercent(step.conversionFromPrevious)}</p>
        </div>
      ))}
    </div>
  );
}

function LanguageBreakdownTable({ rows }: { rows: AnalyticsLanguageBreakdown[] }) {
  if (!rows.length) return <AnalyticsEmpty title="Языки Telegram" text="Нет данных по языкам." />;
  return (
    <AnalyticsTable title="Языки Telegram">
      <thead><tr>{["languageCode", "users", "petCreated", "firstEntry", "paywall", "invoice", "paid", "petConv", "payConv"].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.languageCode ?? "unknown"}>
          <Td>{row.languageCode ?? "unknown"}</Td><Td>{row.users}</Td><Td>{row.petCreated}</Td><Td>{row.firstEntryCreated}</Td><Td>{row.paywallOpened}</Td><Td>{row.invoiceOpened}</Td><Td>{row.paymentSuccess}</Td><Td>{formatPercent(row.petConversion)}</Td><Td>{formatPercent(row.paymentConversion)}</Td>
        </tr>
      ))}</tbody>
    </AnalyticsTable>
  );
}

function PlatformBreakdownTable({ rows }: { rows: AnalyticsPlatformBreakdown[] }) {
  if (!rows.length) return <AnalyticsEmpty title="Платформы" text="Нет данных по платформам." />;
  return (
    <AnalyticsTable title="Платформы">
      <thead><tr>{["platform", "users", "petCreated", "firstEntry", "paid", "petConv"].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.platform ?? "unknown"}>
          <Td>{row.platform ?? "unknown"}</Td><Td>{row.users}</Td><Td>{row.petCreated}</Td><Td>{row.firstEntryCreated}</Td><Td>{row.paymentSuccess}</Td><Td>{formatPercent(row.petConversion)}</Td>
        </tr>
      ))}</tbody>
    </AnalyticsTable>
  );
}

function SourceBreakdownTable({ rows }: { rows: AnalyticsSourceBreakdown[] }) {
  if (!rows.length) return <AnalyticsEmpty title="Источники / affiliate" text="Нет данных по источникам." />;
  return (
    <AnalyticsTable title="Источники / affiliate">
      <thead><tr>{["source", "startParam", "users", "petCreated", "firstEntry", "paywall", "invoice", "paid", "petConv", "payConv"].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const weakSource = row.users >= 5 && row.petConversion < 20;
        return (
          <tr className={weakSource ? "bg-coral/10" : undefined} key={`${row.source ?? "unknown"}-${row.startParam ?? ""}`}>
            <Td>{row.source ?? "unknown"}</Td><Td>{row.startParam ?? "—"}</Td><Td>{row.users}</Td><Td>{row.petCreated}</Td><Td>{row.firstEntryCreated}</Td><Td>{row.paywallOpened}</Td><Td>{row.invoiceOpened}</Td><Td>{row.paymentSuccess}</Td><Td>{formatPercent(row.petConversion)}</Td><Td>{formatPercent(row.paymentConversion)}</Td>
          </tr>
        );
      })}</tbody>
    </AnalyticsTable>
  );
}

function EventsByDayTable({ rows }: { rows: AnalyticsDailyRow[] }) {
  if (!rows.length) return <AnalyticsEmpty title="Events by day" text="Нет событий по дням." />;
  return (
    <AnalyticsTable title="Events by day">
      <thead><tr>{["date", "app_opened", "pet_created", "first_entry", "paywall", "payment"].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.date}>
          <Td>{row.date}</Td><Td>{row.app_opened ?? 0}</Td><Td>{row.pet_created ?? 0}</Td><Td>{row.first_entry_created ?? 0}</Td><Td>{row.paywall_opened ?? 0}</Td><Td>{row.payment_success ?? 0}</Td>
        </tr>
      ))}</tbody>
    </AnalyticsTable>
  );
}

function LatestEventsTable({ events, error, loading }: { events: AnalyticsEvent[]; error: Error | null; loading: boolean }) {
  return (
    <div className="space-y-2">
      <h2 className="section-title">Последние события</h2>
      {loading && <SkeletonBlock rows={4} className="border-0 bg-transparent p-0 shadow-none" />}
      {error && <div className="rounded-lg bg-coral/10 p-3 text-sm font-semibold text-coral">{error.message}</div>}
      {!loading && !error && !events.length ? <EmptyState title="Событий нет" text="Последние события появятся после трекинга." /> : null}
      {events.length ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-950"><tr>{["date", "event", "user", "telegram", "lang", "platform", "source", "metadata"].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
            <tbody>{events.map((event, index) => (
              <tr className="border-t border-zinc-200 dark:border-zinc-800" key={`${event.createdAt}-${event.event}-${index}`}>
                <Td>{formatDateTime(event.createdAt)}</Td><Td>{event.event}</Td><Td>{event.userId ?? "—"}</Td><Td>{event.telegramId ?? "—"}</Td><Td>{event.languageCode ?? "—"}</Td><Td>{event.platform ?? "—"}</Td><Td>{event.source ?? "—"}</Td><Td>{formatMetadata(event.metadata)}</Td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function TopEventsBlock({ summary }: { summary: AnalyticsSummary }) {
  if (!summary.topEvents.length) return <AnalyticsEmpty title="Top events" text="Нет top events." />;
  return (
    <div className="space-y-2">
      <h2 className="section-title">Top events</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {summary.topEvents.map((item) => (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950" key={item.event}>
            <span className="font-bold">{item.event}</span>
            <span className="font-extrabold">{formatNumber(item.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTable({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-2">
      <h2 className="section-title">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-[720px] w-full text-left text-xs">
          {children}
        </table>
      </div>
    </div>
  );
}

function AnalyticsEmpty({ text, title }: { text: string; title: string }) {
  return (
    <div className="space-y-2">
      <h2 className="section-title">{title}</h2>
      <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-500 dark:border-zinc-800">
        {text}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-extrabold text-zinc-500">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">{children}</td>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU");
}

function formatMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || !Object.keys(metadata).length) return "—";
  return Object.entries(metadata).slice(0, 4).map(([key, value]) => `${key}: ${String(value).slice(0, 40)}`).join(", ");
}
