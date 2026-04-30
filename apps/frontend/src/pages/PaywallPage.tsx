import { useMutation } from "@tanstack/react-query";
import { Crown, Sparkles } from "lucide-react";
import { api, jsonBody } from "../api/client";
import { openTelegramInvoice } from "../utils/telegram";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../utils/i18n";

type InvoiceResponse = { invoiceLink: string; amountStars: number };

export default function PaywallPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const createInvoice = useMutation({
    mutationFn: (productType: "MONTHLY" | "LIFETIME") => api<InvoiceResponse>("/api/payments/create-invoice", { method: "POST", body: jsonBody({ productType }) }),
    onSuccess: ({ invoiceLink }) => openTelegramInvoice(invoiceLink, () => auth.mutate())
  });

  return (
    <main className="space-y-4">
      <div className="panel bg-ink text-white dark:bg-zinc-900">
        <Crown className="mb-3 text-coral" size={34} />
        <h1 className="text-[32px] font-extrabold leading-tight">{t("proAccess")}</h1>
        <p className="mt-2 text-sm leading-6 text-white/75">{t("proText")}</p>
      </div>
      <button className="btn btn-primary w-full" disabled={createInvoice.isPending} onClick={() => createInvoice.mutate("MONTHLY")}>
        <Sparkles size={18} /> {t("buyMonthly")}
      </button>
      <button className="btn btn-secondary w-full" disabled={createInvoice.isPending} onClick={() => createInvoice.mutate("LIFETIME")}>
        <Crown size={18} /> {t("buyLifetime")}
      </button>
      {createInvoice.error && <p className="text-sm text-coral">{createInvoice.error.message}</p>}
    </main>
  );
}
