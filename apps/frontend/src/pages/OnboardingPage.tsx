import { useMutation } from "@tanstack/react-query";
import { PawPrint } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, jsonBody } from "../api/client";
import type { Pet } from "../api/types";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { AvatarFilePicker } from "../components/PetAvatar";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { useI18n } from "../utils/i18n";
import { uploadPetAvatar, withAvatarFallback } from "../utils/petAvatar";
import { trackEvent } from "../utils/telegramAnalytics";

export default function OnboardingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pet = useAppStore((state) => state.pet);
  const setPet = useAppStore((state) => state.setPet);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const isAddingPet = searchParams.get("new") === "1";
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<Error | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [createdPetAfterAvatarFailure, setCreatedPetAfterAvatarFailure] = useState<Pet | null>(null);
  const createPet = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api<Pet>("/api/pets", { method: "POST", body: jsonBody(payload) })
  });

  useEffect(() => {
    if (!pet || isAddingPet) trackEvent("onboarding_started", { isAddingPet });
  }, [isAddingPet, pet]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    trackEvent("pet_create_clicked", { type: String(data.type ?? "") });
    setAvatarError(null);
    setCreatedPetAfterAvatarFailure(null);
    try {
      const createdPet = await createPet.mutateAsync({
        ...data,
        weightKg: data.weightKg ? data.weightKg : null,
        ageYears: data.ageYears ? data.ageYears : null,
        healthNotes: data.healthNotes ? data.healthNotes : null
      });
      let nextPet = createdPet;
      if (isAdmin && avatarFile) {
        setIsAvatarUploading(true);
        try {
          nextPet = await uploadPetAvatar(createdPet.id, avatarFile) ?? withAvatarFallback(createdPet, true);
        } catch {
          setCreatedPetAfterAvatarFailure(createdPet);
          setAvatarError(new Error(t("avatarUploadFailed")));
          return;
        } finally {
          setIsAvatarUploading(false);
        }
      }
      setPet(nextPet);
      navigate("/");
    } catch {
      // RequestError below renders the API failure from the mutation.
    }
  }

  if (pet && !isAddingPet) return <Navigate to="/" replace />;
  const isSaving = createPet.isPending || isAvatarUploading;

  return (
    <main className="space-y-4">
      <div>
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-mint text-white"><PawPrint /></div>
        <h1 className="page-title">{isAddingPet ? t("addPet") : "PetCare Diary"}</h1>
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
        {isAdmin && <AvatarFilePicker file={avatarFile} disabled={isSaving} uploadError={avatarError} onFileChange={setAvatarFile} onClear={() => setAvatarFile(null)} />}
        <button className="btn btn-primary w-full" disabled={isSaving || Boolean(createdPetAfterAvatarFailure)}>{isSaving ? t("saving") : t("startDiary")}</button>
        {createdPetAfterAvatarFailure ? (
          <button className="btn btn-secondary w-full" type="button" onClick={() => { setPet(createdPetAfterAvatarFailure); navigate("/"); }}>
            {t("startDiary")}
          </button>
        ) : null}
        <RequestError error={createPet.error ?? avatarError} />
      </form>
      <MedicalDisclaimer />
    </main>
  );
}
