import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ChangelogModal, changelogSeenKey, openChangelogEvent } from "./components/ChangelogModal";
import { Layout } from "./components/Layout";
import { SkeletonBlock } from "./components/SkeletonBlock";
import { useAuth } from "./hooks/useAuth";
import { useAppStore } from "./store/appStore";
import DashboardPage from "./pages/DashboardPage";
import AiAssistantPage from "./pages/AiAssistantPage";
import DiaryPage from "./pages/DiaryPage";
import FeedingPage from "./pages/FeedingPage";
import MedicinesPage from "./pages/MedicinesPage";
import NotePage from "./pages/NotePage";
import AdminPage from "./pages/AdminPage";
import OnboardingPage from "./pages/OnboardingPage";
import PaywallPage from "./pages/PaywallPage";
import ProfilePage from "./pages/ProfilePage";
import RemindersPage from "./pages/RemindersPage";
import ReportPage from "./pages/ReportPage";
import SymptomsPage from "./pages/SymptomsPage";
import VaccinationsPage from "./pages/VaccinationsPage";
import WaterPage from "./pages/WaterPage";
import WeightPage from "./pages/WeightPage";
import { useI18n } from "./utils/i18n";
import { hideTelegramBackButton } from "./utils/telegram";
import { trackEvent } from "./utils/telegramAnalytics";

const freeRoutes = new Set(["/paywall", "/profile", "/admin"]);
const routesWithoutPet = new Set(["/onboarding", "/paywall", "/profile", "/admin"]);
const appOpenedSessionKey = "petcare-analytics-app-opened";

function hasSeenChangelog() {
  try {
    return localStorage.getItem(changelogSeenKey) === "1";
  } catch {
    return false;
  }
}

function markChangelogSeen() {
  try {
    localStorage.setItem(changelogSeenKey, "1");
  } catch {
    // Some restricted WebViews can throw on localStorage access. Session state still closes the sheet.
  }
}

function getAuthErrorMessage(error: Error) {
  if (error.message === "Failed to fetch") {
    return "Frontend cannot connect to the backend API. Start backend on http://localhost:3001 and check VITE_API_URL.";
  }

  return error.message;
}

export default function App() {
  const { t } = useI18n();
  const auth = useAuth();
  const user = useAppStore((state) => state.user);
  const accessStatus = useAppStore((state) => state.accessStatus);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const pet = useAppStore((state) => state.pet);
  const navigate = useNavigate();
  const location = useLocation();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const appOpenedTrackedRef = useRef(false);

  useEffect(() => {
    auth.mutate();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (appOpenedTrackedRef.current) return;
    try {
      if (sessionStorage.getItem(appOpenedSessionKey) === "1") return;
      sessionStorage.setItem(appOpenedSessionKey, "1");
    } catch {
      // Restricted WebViews may deny sessionStorage; analytics still stays non-blocking.
    }
    appOpenedTrackedRef.current = true;
    trackEvent("app_opened", { path: location.pathname });
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user) return;
    const isAddingPet = location.pathname === "/onboarding" && new URLSearchParams(location.search).get("new") === "1";
    if (accessStatus === "expired" && !isAdmin && !freeRoutes.has(location.pathname)) navigate("/paywall", { replace: true });
    if (pet && location.pathname === "/onboarding" && !isAddingPet) navigate("/", { replace: true });
    if (accessStatus !== "expired" && !pet && !routesWithoutPet.has(location.pathname)) navigate("/onboarding", { replace: true });
  }, [user, accessStatus, isAdmin, pet, location.pathname, location.search, navigate]);

  useEffect(() => {
    hideTelegramBackButton();
  }, [location.pathname]);

  useEffect(() => {
    function openChangelog() {
      setChangelogOpen(true);
    }

    window.addEventListener(openChangelogEvent, openChangelog);
    return () => window.removeEventListener(openChangelogEvent, openChangelog);
  }, []);

  useEffect(() => {
    if (!user || location.pathname !== "/" || hasSeenChangelog()) return;
    setChangelogOpen(true);
  }, [user, location.pathname]);

  function closeChangelog() {
    markChangelogSeen();
    setChangelogOpen(false);
  }

  if (!user && !auth.error) {
    return <Layout><SkeletonBlock rows={4} className="mt-20" /><p className="mt-3 text-center text-xs font-semibold text-zinc-500">{t("appLoading")}</p></Layout>;
  }

  if (auth.error && !user) {
    return <Layout><div className="panel mt-20 text-center text-coral">{auth.error.message === "Failed to fetch" ? t("apiFailed") : getAuthErrorMessage(auth.error)}</div></Layout>;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/feeding" element={<FeedingPage />} />
        <Route path="/water" element={<WaterPage />} />
        <Route path="/vaccinations" element={<VaccinationsPage />} />
        <Route path="/ai" element={<AiAssistantPage />} />
        <Route path="/symptoms" element={<SymptomsPage />} />
        <Route path="/medicines" element={<MedicinesPage />} />
        <Route path="/notes" element={<NotePage />} />
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/paywall" element={<PaywallPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChangelogModal open={changelogOpen} onClose={closeChangelog} />
    </Layout>
  );
}
