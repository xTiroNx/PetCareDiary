import { useMutation } from "@tanstack/react-query";
import { Crown, Sparkles } from "lucide-react";
import { api, jsonBody } from "../api/client";
import { AccessNotice } from "../components/AccessNotice";
import { FeedbackForm } from "../components/FeedbackForm";
import { openTelegramInvoice } from "../utils/telegram";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../utils/i18n";
import { trackEvent } from "../utils/telegramAnalytics";
import { useEffect } from "react";
import { useAppStore } from "../store/appStore";

type InvoiceResponse = { invoiceLink: string; amountStars: number };
type ProductType = "MONTHLY" | "SIX_MONTHS" | "ADMIN_TEST_DAY";
type PlanLabelKey = "buyMonthly" | "buySixMonths" | "buyAdminTestDay";

const plans: Array<{ productType: ProductType; labelKey: PlanLabelKey }> = [
  { productType: "MONTHLY", labelKey: "buyMonthly" },
  { productType: "SIX_MONTHS", labelKey: "buySixMonths" }
];
const adminTestPlan: { productType: ProductType; labelKey: PlanLabelKey } = {
  productType: "ADMIN_TEST_DAY",
  labelKey: "buyAdminTestDay"
};

export default function PaywallPage() {
  const { t } = useI18n();
  const isAdmin = useAppStore((state) => state.isAdmin);
  const auth = useAuth();
  const createInvoice = useMutation({
    mutationFn: (productType: ProductType) => api<InvoiceResponse>("/api/payments/create-invoice", { method: "POST", body: jsonBody({ productType }) }),
    onSuccess: ({ invoiceLink }, productType) => {
      trackEvent("invoice_opened", { productType });
      openTelegramInvoice(invoiceLink, () => auth.mutate());
    }
  });

  useEffect(() => {
    trackEvent("paywall_opened");
  }, []);

  return (
    <main className="space-y-4">
      <div className="panel bg-ink text-white dark:bg-zinc-900">
        <Crown className="mb-3 text-coral" size={34} />
        <h1 className="text-[32px] font-extrabold leading-tight">{t("proAccess")}</h1>
        <p className="mt-2 text-sm leading-6 text-white/75">{t("proText")}</p>
      </div>
      <AccessNotice />
      <div className="grid gap-2">
        {[...plans, ...(isAdmin ? [adminTestPlan] : [])].map((plan, index) => (
          <button
            className={index === 0 ? "btn btn-primary w-full" : "btn btn-secondary w-full"}
            disabled={createInvoice.isPending}
            key={plan.productType}
            onClick={() => createInvoice.mutate(plan.productType)}
          >
            <Sparkles size={18} /> {t(plan.labelKey)}
          </button>
        ))}
      </div>
      {createInvoice.error && <p className="text-sm text-coral">{createInvoice.error.message}</p>}
      <FeedbackForm />
    </main>
  );
}
