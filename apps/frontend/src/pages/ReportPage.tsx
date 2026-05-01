import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { api, apiBlob } from "../api/client";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

type StructuredReport = {
  petName: string;
  counts: { feeding: number; symptoms: number; medicines: number; medicinesTaken?: number; weights: number; notes?: number };
  recentNotes?: Array<{ id: string; note: string; dateTime: string }>;
};
type ExportStatus = { usedToday: number; limit: number; remaining: number };
type ReportPeriod = "7" | "14" | "30" | "all";

export default function ReportPage() {
  const { t } = useI18n();
  const pet = useAppStore((state) => state.pet);
  const [period, setPeriod] = useState<ReportPeriod>("7");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const report = useQuery({ queryKey: ["report", pet?.id, period], queryFn: () => api<StructuredReport>(`/api/reports/summary?petId=${pet!.id}&period=${period}`), enabled: Boolean(pet) });
  const exportStatus = useQuery({ queryKey: ["report-export-status"], queryFn: () => api<ExportStatus>("/api/reports/exports/status"), enabled: Boolean(pet) });
  const exportPdf = useMutation({
    mutationFn: () => apiBlob(`/api/reports/summary.pdf?petId=${pet!.id}&period=${period}`),
    onSuccess: async (blob) => {
      const filename = `petcare-report-${period === "all" ? "all" : `${period}d`}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const shareTarget = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && shareTarget.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "PetCare Diary report" });
        setMessage(t("exportDownloaded"));
        queryClient.invalidateQueries({ queryKey: ["report-export-status"] });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
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
        <SelectField className="w-44 shrink-0" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
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
