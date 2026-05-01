import { Link } from "react-router-dom";
import { Home, LogOut, Maximize2, Minimize2, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AccessBadge } from "../components/AccessBadge";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
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

export default function ProfilePage() {
  const { language, setLanguage, t } = useI18n();
  const user = useAppStore((state) => state.user);
  const pet = useAppStore((state) => state.pet);
  const pets = useAppStore((state) => state.pets);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const [fullscreen, setFullscreen] = useState(isTelegramFullscreen());

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
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800" key={item.id}>
              <p className="font-semibold">{item.name}</p>
              <p className="text-xs text-zinc-500">{item.type}</p>
            </div>
          )) : <p className="muted">{t("noPet")}</p>}
        </div>
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
