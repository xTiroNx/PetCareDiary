import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./hooks/useAuth";
import { useAppStore } from "./store/appStore";
import DashboardPage from "./pages/DashboardPage";
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
import WeightPage from "./pages/WeightPage";
import { useI18n } from "./utils/i18n";
import { configureTelegramBackButton, telegramSelection } from "./utils/telegram";

const freeRoutes = new Set(["/paywall", "/profile", "/admin"]);
const routesWithoutPet = new Set(["/onboarding", "/paywall", "/profile", "/admin"]);

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
  const pet = useAppStore((state) => state.pet);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    auth.mutate();
  }, []);

  useEffect(() => {
    if (!user) return;
    const isAddingPet = location.pathname === "/onboarding" && new URLSearchParams(location.search).get("new") === "1";
    if (accessStatus === "expired" && !freeRoutes.has(location.pathname)) navigate("/paywall", { replace: true });
    if (pet && location.pathname === "/onboarding" && !isAddingPet) navigate("/", { replace: true });
    if (accessStatus !== "expired" && !pet && !routesWithoutPet.has(location.pathname)) navigate("/onboarding", { replace: true });
  }, [user, accessStatus, pet, location.pathname, location.search, navigate]);

  useEffect(() => {
    return configureTelegramBackButton(location.pathname !== "/", () => {
      telegramSelection();
      if (window.history.length > 1) navigate(-1);
      else navigate("/", { replace: true });
    });
  }, [location.pathname, navigate]);

  if (auth.isPending && !user) {
    return <Layout><div className="panel mt-20 text-center">{t("appLoading")}</div></Layout>;
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
    </Layout>
  );
}
