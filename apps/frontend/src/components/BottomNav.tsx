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
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={t(item.labelKey)}
          title={t(item.labelKey)}
          onClick={() => telegramSelection()}
          className={({ isActive }) =>
            clsx(
              "flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[9px] font-bold leading-[1.05] transition",
              isActive ? "bg-mint text-white shadow-soft" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            )
          }
        >
          <item.icon size={17} className="shrink-0" />
          <span className="nav-label">{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
