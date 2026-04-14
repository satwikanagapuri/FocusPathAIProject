import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/tasks", label: "Tasks", icon: "✅" },
  { to: "/pomodoro", label: "Pomodoro", icon: "⏱️" },
  { to: "/habits", label: "Habits", icon: "🔥" },
  { to: "/notes", label: "Notes", icon: "📝" },
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/flashcards", label: "Flashcards", icon: "🃏" },
  { to: "/analytics", label: "Analytics", icon: "📊" },
  { to: "/chat", label: "AI Chat", icon: "🤖" },
  { to: "/career", label: "Career", icon: "🚀" },
  { to: "/profile", label: "Profile", icon: "👤" },
];

export default function Nav() {
  const location = useLocation();
  const { setTheme, theme, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-200/70 dark:border-slate-800/70 px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ☰
          </button>
          <Link to="/dashboard" className="font-extrabold text-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent hidden sm:block">
            FocusPath AI
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-1 flex-wrap">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors ${
                location.pathname === l.to
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {l.icon} {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="absolute top-12 left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={`text-sm font-medium px-3 py-2 rounded-xl transition-colors ${
                  location.pathname === l.to
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {l.icon} {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
