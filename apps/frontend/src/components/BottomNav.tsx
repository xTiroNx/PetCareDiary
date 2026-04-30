import { BarChart3, Bell, HeartPulse, Home, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useI18n } from "../utils/i18n";
import { telegramSelection } from "../utils/telegram";

const items = [
  { to: "/", labelKey: "navHome", icon: Home },
  { to: "/diary", labelKey: "navDiary", icon: HeartPulse },
  { to: "/reminders", labelKey: "navReminders", icon: Bell },
  { to: "/report", labelKey: "navReport", icon: BarChart3 },
  { to: "/profile", labelKey: "navProfile", icon: UserRound }
] as const;

export function BottomNav() {
  const { t } = useI18n();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-2 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={t(item.labelKey)}
            title={t(item.labelKey)}
            onClick={() => telegramSelection()}
            className={({ isActive }) =>
              clsx(
                "flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[9.5px] font-bold leading-[1.05] transition",
                isActive ? "bg-mint text-white shadow-soft" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              )
            }
          >
            <item.icon size={17} className="shrink-0" />
            <span className="nav-label">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
