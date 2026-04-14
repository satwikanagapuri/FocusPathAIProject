import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";

import { apiGet, apiPatch, apiPost, apiPut } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

export default function ProfilePage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const theme = useAuthStore((s) => s.theme);

  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setTheme = useAuthStore((s) => s.setTheme);

  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [studyTimePerDayMinutes, setStudyTimePerDayMinutes] = useState(60);
  const [focusSubjects, setFocusSubjects] = useState("");
  const [careerObjectiveText, setCareerObjectiveText] = useState("");

  useEffect(() => {
    async function run() {
      try {
        const data = await apiGet("/auth/me");
        const u = data.user;
        if (!u) {
          toast.error("Session expired. Please login again.");
          logout();
          navigate("/auth");
          return;
        }
        setDisplayName(u.displayName || "");
        const prefs = u.preferences || {};
        setStudyTimePerDayMinutes(prefs?.goals?.studyTimePerDayMinutes || 60);
        setFocusSubjects((prefs?.goals?.focusSubjects || []).join(", "));
        setCareerObjectiveText(prefs?.careerObjectives?.objectiveText || "");

        if (prefs?.theme && prefs.theme !== theme) setTheme(prefs.theme);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          toast.error("Session expired. Please login again.");
          logout();
          navigate("/auth");
          return;
        }
        toast.error(err?.response?.data?.error || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    if (token) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const canSave = useMemo(() => !loading, [loading]);

  async function onSave() {
    try {
      const focusSubjectsList = focusSubjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const preferences = {
        theme,
        goals: { studyTimePerDayMinutes, focusSubjects: focusSubjectsList },
        careerObjectives: { objectiveText: careerObjectiveText },
      };

      const res = await apiPut("/auth/me", { displayName: displayName || undefined, preferences });

      setAuth({ token, user: res.user });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Save failed");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Profile & Settings</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Personalize your study goals and career objectives.</p>
          <div className="mt-2">
            <Link
              to="/career"
              className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-sm hover:from-indigo-700 hover:to-fuchsia-700 transition"
            >
              Open AI Career Assistant
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/auth");
          }}
          className="rounded-xl px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold transition"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-3">Account</h3>

          <label className="block">
            <span className="text-sm font-medium">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
              placeholder="Your name"
            />
          </label>

          <div className="mt-4">
            <span className="text-sm font-medium">Theme</span>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex-1 rounded-xl px-3 py-2 font-semibold border ${
                  theme === "light"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200/60 dark:border-slate-700"
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex-1 rounded-xl px-3 py-2 font-semibold border ${
                  theme === "dark"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200/60 dark:border-slate-700"
                }`}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-3">Study Goals</h3>

          <label className="block">
            <span className="text-sm font-medium">Study time per day (minutes)</span>
            <input
              type="number"
              min={10}
              max={300}
              value={studyTimePerDayMinutes}
              onChange={(e) => setStudyTimePerDayMinutes(parseInt(e.target.value || "0", 10) || 60)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
            />
          </label>

          <label className="block mt-4">
            <span className="text-sm font-medium">Focus subjects (comma separated)</span>
            <input
              value={focusSubjects}
              onChange={(e) => setFocusSubjects(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
              placeholder="e.g. React, Algorithms, SQL"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
        <h3 className="font-semibold mb-3">Career Objectives</h3>
        <label className="block">
          <span className="text-sm font-medium">What job/career are you aiming for?</span>
          <textarea
            value={careerObjectiveText}
            onChange={(e) => setCareerObjectiveText(e.target.value)}
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none min-h-[120px]"
            placeholder="Example: I want to become a frontend engineer and land a role in 6 months."
          />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-xl px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold transition"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60 transition"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}


