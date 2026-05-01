import { useMutation } from "@tanstack/react-query";
import { PawPrint } from "lucide-react";
import { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, jsonBody } from "../api/client";
import type { Pet } from "../api/types";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";

export default function OnboardingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pet = useAppStore((state) => state.pet);
  const setPet = useAppStore((state) => state.setPet);
  const createPet = useMutation({
    mutationFn: (payload: Record<string, FormDataEntryValue>) => api<Pet>("/api/pets", { method: "POST", body: jsonBody(payload) }),
    onSuccess: (pet) => {
      setPet(pet);
      navigate("/");
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createPet.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  if (pet) return <Navigate to="/" replace />;

  return (
    <main className="space-y-4">
      <div>
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-mint text-white"><PawPrint /></div>
        <h1 className="page-title">PetCare Diary</h1>
        <p className="muted mt-1">{t("onboardingSubtitle")}</p>
      </div>
      <form onSubmit={onSubmit} className="panel space-y-3">
        <SelectField name="type" defaultValue="CAT">
          <option value="CAT">{t("cat")}</option>
          <option value="DOG">{t("dog")}</option>
          <option value="OTHER">{t("otherPet")}</option>
        </SelectField>
        <input name="name" className="input" placeholder={t("petName")} required />
        <input name="weightKg" className="input" type="number" step="0.1" placeholder={t("weightKg")} />
        <input name="ageYears" className="input" type="number" step="0.1" placeholder={t("ageYears")} />
        <textarea name="healthNotes" className="input min-h-24" placeholder={t("healthNotes")} />
        <button className="btn btn-primary w-full" disabled={createPet.isPending}>{createPet.isPending ? t("saving") : t("startDiary")}</button>
      </form>
      <MedicalDisclaimer />
    </main>
  );
}
