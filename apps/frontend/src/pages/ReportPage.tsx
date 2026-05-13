import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { API_URL, api, apiBlob } from "../api/client";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";
import { downloadTelegramFile, getInitData, isTelegram } from "../utils/telegram";
import { trackEvent } from "../utils/telegramAnalytics";

type StructuredReport = {
  petName: string;
  counts: { feeding: number; symptoms: number; medicines: number; medicinesTaken?: number; weights: number; notes?: number };
  recentNotes?: Array<{ id: string; note: string; dateTime: string }>;
};
type ExportStatus = { usedToday: number; limit: number; remaining: number };
type ReportPeriod = "7" | "14" | "30" | "all";

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function reportSearchParams({ petId, period, timezone, locale }: { petId: string; period: ReportPeriod; timezone: string; locale: string }) {
  const params = new URLSearchParams();
  params.set("petId", petId);
  params.set("period", period);
  params.set("timezone", timezone);
  params.set("locale", locale);
  return params;
}

function reportDownloadUrl({ petId, period, timezone, locale }: { petId: string; period: ReportPeriod; timezone: string; locale: string }) {
  const url = new URL("/api/reports/summary.pdf", API_URL);
  const params = reportSearchParams({ petId, period, timezone, locale });
  params.set("tgInitData", getInitData());
  url.search = params.toString();
  return url.toString();
}

function reportPdfPath(options: { petId: string; period: ReportPeriod; timezone: string; locale: string }) {
  return `/api/reports/summary.pdf?${reportSearchParams(options)}`;
}

function canSharePdfFile(fileName: string) {
  if (!navigator.share || typeof File === "undefined") return false;
  if (!navigator.canShare) return true;

  try {
    return navigator.canShare({
      files: [new File(["pdf"], fileName, { type: "application/pdf" })]
    });
  } catch {
    return false;
  }
}

async function sharePdfBlob(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type || "application/pdf" });
  const shareData: ShareData = {
    files: [file],
    title: "PetCare Diary",
    text: "PetCare Diary PDF report"
  };

  if (!navigator.share || navigator.canShare?.(shareData) === false) return false;
  await navigator.share(shareData);
  return true;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isShareCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ReportPage() {
  const { language, t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const [period, setPeriod] = useState<ReportPeriod>("7");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const timezone = getDeviceTimeZone();
  const locale = language;
  const report = useQuery({
    queryKey: ["report", pet?.id, period, timezone, locale],
    queryFn: () => api<StructuredReport>(`/api/reports/summary?${reportSearchParams({ petId: pet!.id, period, timezone, locale })}`),
    enabled: Boolean(pet)
  });

  useEffect(() => {
    if (!pet) return;
    trackEvent("report_preview_opened", { period });
  }, [pet, period]);
  const exportStatus = useQuery({ queryKey: ["report-export-status"], queryFn: () => api<ExportStatus>("/api/reports/exports/status"), enabled: Boolean(pet) });
  const exportPdf = useMutation({
    mutationFn: async () => {
      const filename = `petcare-report-${period === "all" ? "all" : `${period}d`}.pdf`;
      const reportOptions = { petId: pet!.id, period, timezone, locale };

      if (canSharePdfFile(filename)) {
        const blob = await apiBlob(reportPdfPath(reportOptions));
        try {
          if (await sharePdfBlob(blob, filename)) {
            return { pendingNativeDownload: false, cancelled: false };
          }
        } catch (error) {
          if (isShareCancelled(error)) return { pendingNativeDownload: false, cancelled: true };
          throw error;
        }
        if (isTelegram()) throw new Error(t("telegramUnsupported"));
        downloadBlob(blob, filename);
        return { pendingNativeDownload: false, cancelled: false };
      }

      const started = downloadTelegramFile(reportDownloadUrl(reportOptions), filename, (accepted) => {
        if (!accepted) return;
        setMessage(t("exportDownloaded"));
        queryClient.invalidateQueries({ queryKey: ["report-export-status"] });
      });
      if (started) return { pendingNativeDownload: true, cancelled: false };

      if (isTelegram()) {
        throw new Error(t("telegramUnsupported"));
      }

      const blob = await apiBlob(reportPdfPath(reportOptions));
      downloadBlob(blob, filename);
      return { pendingNativeDownload: false, cancelled: false };
    },
    onSuccess: ({ pendingNativeDownload, cancelled }) => {
      if (pendingNativeDownload || cancelled) return;
      setMessage(t("exportDownloaded"));
      queryClient.invalidateQueries({ queryKey: ["report-export-status"] });
    },
    onError: (error) => {
      setMessage((error as Error & { code?: string }).code === "REPORT_EXPORT_LIMIT_REACHED" ? t("exportLimitReached") : error.message);
    }
  });

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title min-w-0">{t("reportTitle")}</h1>
        <SelectField wrapperClassName="w-44 shrink-0" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
          <option value="7">{t("days7")}</option><option value="14">{t("days14")}</option><option value="30">{t("days30")}</option><option value="all">{t("allPeriod")}</option>
        </SelectField>
      </div>
      <section className="panel grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-bold">{report.data?.counts.feeding ?? 0}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-zinc-500">{t("feedingsCount")}</p></div>
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-bold">{report.data?.counts.symptoms ?? 0}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-zinc-500">{t("symptomsCount")}</p></div>
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-bold">{report.data?.counts.medicines ?? 0}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-zinc-500">{t("medicinesCount")}</p></div>
        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-bold">{report.data?.counts.weights ?? 0}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-zinc-500">{t("weightCount")}</p></div>
        <div className="col-span-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><p className="text-2xl font-bold">{report.data?.counts.notes ?? 0}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-zinc-500">{t("notesCount")}</p></div>
      </section>
      <section className="panel space-y-3">
        <div>
          <p className="section-title">{t("exportPdf")}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{t("exportLimit", { remaining: exportStatus.data?.remaining ?? 0, limit: exportStatus.data?.limit ?? 3 })}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{t("pdfMvpNote")}</p>
        </div>
        <button className="btn btn-primary w-full" disabled={exportPdf.isPending || exportStatus.data?.remaining === 0} onClick={() => exportPdf.mutate()}>
          <Download size={17} />{exportPdf.isPending ? t("exportingPdf") : t("exportPdf")}
        </button>
        {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}
      </section>
      <section className="panel space-y-3">
        <h2 className="text-lg font-extrabold">{report.data?.petName ?? t("reportTitle")}</h2>
        {report.isLoading ? <p className="muted">{t("loading")}</p> : null}
        {report.error ? <p className="text-sm font-semibold text-coral">{report.error.message}</p> : null}
        {report.data ? (
          <div className="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <p>{t("feedingsCount")}: <span className="font-semibold">{report.data.counts.feeding}</span></p>
            <p>{t("symptomsCount")}: <span className="font-semibold">{report.data.counts.symptoms}</span></p>
            <p>{t("medicinesCount")}: <span className="font-semibold">{report.data.counts.medicines}</span> · {t("taken")}: <span className="font-semibold">{report.data.counts.medicinesTaken ?? 0}</span></p>
            <p>{t("weightCount")}: <span className="font-semibold">{report.data.counts.weights}</span></p>
            <p>{t("notesCount")}: <span className="font-semibold">{report.data.counts.notes ?? 0}</span></p>
          </div>
        ) : null}
        {report.data?.recentNotes?.length ? (
          <div>
            <p className="section-title">{t("notesCount")}</p>
            <ul className="mt-2 space-y-2">
              {report.data.recentNotes.map((note) => (
                <li className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950" key={note.id}>{note.note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}
