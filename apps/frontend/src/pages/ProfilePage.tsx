import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Edit3, Home, LogOut, Maximize2, Minimize2, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, jsonBody } from "../api/client";
import type { Pet, PetType } from "../api/types";
import { AccessBadge } from "../components/AccessBadge";
import { ConfirmAction } from "../components/ConfirmAction";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { RequestError } from "../components/RequestError";
import { SelectField } from "../components/SelectField";
import { useAppStore } from "../store/appStore";
import { languages, useI18n } from "../utils/i18n";
import {
  addTelegramHomeScreenShortcut,
  closeTelegramApp,
  exitTelegramFullscreen,
  isTelegramFullscreen,
  onTelegramEvent,
  requestTelegramFullscreen,
  telegramAlert,
  telegramConfirm,
  telegramSelection
} from "../utils/telegram";

type PetDraft = {
  name: string;
  type: PetType;
  weightKg: string;
  ageYears: string;
  healthNotes: string;
};

function toDraft(pet: Pet): PetDraft {
  return {
    name: pet.name,
    type: pet.type,
    weightKg: pet.weightKg ? String(pet.weightKg) : "",
    ageYears: pet.ageYears ? String(pet.ageYears) : "",
    healthNotes: pet.healthNotes ?? ""
  };
}

export default function ProfilePage() {
  const { language, setLanguage, t } = useI18n();
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const pet = useAppStore((state) => state.pet);
  const pets = useAppStore((state) => state.pets);
  const setPets = useAppStore((state) => state.setPets);
  const setActivePet = useAppStore((state) => state.setActivePet);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const [fullscreen, setFullscreen] = useState(isTelegramFullscreen());
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [petDraft, setPetDraft] = useState<PetDraft | null>(null);
  const petTypeLabels: Record<PetType, string> = { CAT: t("cat"), DOG: t("dog"), OTHER: t("otherPet") };

  const updatePet = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api<Pet>(`/api/pets/${id}`, { method: "PATCH", body: jsonBody(body) }),
    onSuccess: (updatedPet) => {
      setPets(pets.map((item) => item.id === updatedPet.id ? updatedPet : item));
      setEditingPetId(null);
      setPetDraft(null);
    }
  });

  const deletePet = useMutation({
    mutationFn: (id: string) => api<void>(`/api/pets/${id}`, { method: "DELETE" }),
    onSuccess: (_value, deletedId) => {
      const nextPets = pets.filter((item) => item.id !== deletedId);
      setPets(nextPets);
      setEditingPetId(null);
      setPetDraft(null);
      if (!nextPets.length) navigate("/onboarding", { replace: true });
    }
  });

  useEffect(() => {
    return onTelegramEvent("fullscreenChanged", () => setFullscreen(isTelegramFullscreen()));
  }, []);

  function toggleFullscreen() {
    telegramSelection();
    const ok = fullscreen ? exitTelegramFullscreen() : requestTelegramFullscreen();
    setFullscreen(isTelegramFullscreen());
    if (!ok) void telegramAlert(t("telegramUnsupported"));
  }

  function addHomeScreen() {
    telegramSelection();
    if (!addTelegramHomeScreenShortcut()) void telegramAlert(t("homeScreenFallback"));
  }

  async function closeApp() {
    telegramSelection();
    const confirmed = await telegramConfirm(t("closeAppConfirm"));
    if (confirmed === false) return;
    if (confirmed === null && !window.confirm(t("closeAppConfirm"))) return;
    if (!closeTelegramApp()) void telegramAlert(t("telegramUnsupported"));
  }

  function startPetEdit(item: Pet) {
    telegramSelection();
    setEditingPetId(item.id);
    setPetDraft(toDraft(item));
  }

  function updatePetDraft(key: keyof PetDraft, value: string) {
    setPetDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function savePet(id: string) {
    if (!petDraft) return;
    updatePet.mutate({
      id,
      body: {
        name: petDraft.name,
        type: petDraft.type,
        weightKg: petDraft.weightKg || null,
        ageYears: petDraft.ageYears || null,
        healthNotes: petDraft.healthNotes || null
      }
    });
  }

  return (
    <main className="space-y-4">
      <h1 className="page-title">{t("profile")}</h1>
      <section className="panel space-y-2">
        <AccessBadge />
        <div className="grid gap-1 pt-1">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("telegramId")}: <span className="font-semibold text-ink dark:text-white">{user?.telegramId}</span></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("pet")}: <span className="font-semibold text-ink dark:text-white">{pet?.name ?? t("noPet")}</span></p>
        </div>
      </section>
      <section className="panel space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">{t("pets")}</h2>
          <Link to="/onboarding?new=1" className="btn btn-secondary min-h-9 px-3 text-xs"><Plus size={15} />{t("addPet")}</Link>
        </div>
        <div className="grid gap-2">
          {pets.length ? pets.map((item) => (
            <div className={clsx("rounded-lg border px-3 py-3 text-sm", item.id === pet?.id ? "border-mint/60 bg-mint/5" : "border-zinc-200 dark:border-zinc-800")} key={item.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{item.name}</p>
                  <p className="text-xs text-zinc-500">{petTypeLabels[item.type]}</p>
                  {item.id === pet?.id && <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-mint"><CheckCircle2 size={13} />{t("activePet")}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {item.id !== pet?.id && (
                    <button className="icon-btn" aria-label={t("activePet")} title={t("activePet")} onClick={() => setActivePet(item.id)}><CheckCircle2 size={16} /></button>
                  )}
                  <button className="icon-btn" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => startPetEdit(item)}><Edit3 size={16} /></button>
                  <ConfirmAction className="icon-btn" ariaLabel={t("deleteRecord")} disabled={deletePet.isPending} onConfirm={() => deletePet.mutate(item.id)}><Trash2 size={16} /></ConfirmAction>
                </div>
              </div>
              {editingPetId === item.id && petDraft ? (
                <div className="mt-3 grid gap-2">
                  <input className="input" value={petDraft.name} onChange={(event) => updatePetDraft("name", event.target.value)} placeholder={t("petName")} />
                  <SelectField value={petDraft.type} onChange={(event) => updatePetDraft("type", event.target.value as PetType)}>
                    <option value="CAT">{t("cat")}</option>
                    <option value="DOG">{t("dog")}</option>
                    <option value="OTHER">{t("otherPet")}</option>
                  </SelectField>
                  <input className="input" value={petDraft.weightKg} inputMode="decimal" onChange={(event) => updatePetDraft("weightKg", event.target.value)} placeholder={t("weightKg")} />
                  <input className="input" value={petDraft.ageYears} inputMode="decimal" onChange={(event) => updatePetDraft("ageYears", event.target.value)} placeholder={t("ageYears")} />
                  <textarea className="input min-h-20" value={petDraft.healthNotes} onChange={(event) => updatePetDraft("healthNotes", event.target.value)} placeholder={t("healthNotes")} />
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn btn-primary" disabled={updatePet.isPending || !petDraft.name.trim()} onClick={() => savePet(item.id)}><Save size={16} />{t("save")}</button>
                    <button className="btn btn-secondary" onClick={() => { setEditingPetId(null); setPetDraft(null); }}><X size={16} />{t("cancel")}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid gap-1 text-xs text-zinc-500">
                  {item.weightKg ? <p>{t("weightKg")}: {item.weightKg}</p> : null}
                  {item.ageYears ? <p>{t("ageYears")}: {item.ageYears}</p> : null}
                  {item.healthNotes ? <p className="break-words">{item.healthNotes}</p> : null}
                </div>
              )}
            </div>
          )) : <p className="muted">{t("noPet")}</p>}
        </div>
        <RequestError error={updatePet.error ?? deletePet.error} />
      </section>
      <section className="panel space-y-2">
        <label className="section-title block" htmlFor="language">{t("language")}</label>
        <SelectField id="language" value={language} onChange={(event) => { telegramSelection(); setLanguage(event.target.value as typeof language); }}>
          {languages.map((item) => (
            <option key={item.code} value={item.code}>{item.nativeName}</option>
          ))}
        </SelectField>
      </section>
      <section className="panel space-y-3">
        <div>
          <h2 className="section-title">{t("telegramTools")}</h2>
          <p className="muted mt-1">{t("telegramToolsHint")}</p>
        </div>
        <div className="grid gap-2">
          <button className="btn btn-secondary w-full" type="button" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            {fullscreen ? t("exitFullscreen") : t("enterFullscreen")}
          </button>
          <button className="btn btn-secondary w-full" type="button" onClick={addHomeScreen}>
            <Home size={17} />{t("addHomeScreen")}
          </button>
          <button className="btn btn-muted w-full" type="button" onClick={closeApp}>
            <LogOut size={17} />{t("closeApp")}
          </button>
        </div>
      </section>
      {isAdmin && (
        <Link to="/admin" className="btn btn-primary w-full">
          <ShieldCheck size={18} />{t("adminPanel")}
        </Link>
      )}
      <Link to="/paywall" className="btn btn-secondary w-full">{t("manageAccess")}</Link>
      <MedicalDisclaimer />
    </main>
  );
}
