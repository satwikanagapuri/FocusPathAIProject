import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { io } from "socket.io-client";
import { Link } from "react-router-dom";

import { apiGet, apiPost } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function badgeClass(priority) {
  if (priority === "high") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (priority === "medium") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function normalizeStudyPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  return {
    title: plan.title || "Personalized Study Plan",
    weeklySchedule: Array.isArray(plan.weeklySchedule) ? plan.weeklySchedule : [],
    milestones: Array.isArray(plan.milestones) ? plan.milestones : [],
    weaknessChecks: Array.isArray(plan.weaknessChecks) ? plan.weaknessChecks : [],
    raw: typeof plan.raw === "string" ? plan.raw : null,
  };
}

export default function DashboardPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [motivation, setMotivation] = useState(null);

  // ---------- AI Study Plan generator ----------
  const [planBusy, setPlanBusy] = useState(false);
  const [studyPlan, setStudyPlan] = useState(null);
  const [planSubjects, setPlanSubjects] = useState("");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [llmStatus, setLlmStatus] = useState(null);

  const autoGenerateTimerRef = useRef(null);
  const lastAutoKeyRef = useRef("");
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const defaults = user?.preferences?.goals?.focusSubjects || [];
    if (Array.isArray(defaults) && defaults.length) {
      setPlanSubjects(defaults.join(", "));
    }
  }, [user]);

  function parseSubjects(input) {
    return String(input || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((v, idx, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx);
  }

  async function generatePlan({ manual = false } = {}) {
    const subjects = parseSubjects(planSubjects);
    if (subjects.length === 0) {
      if (manual) toast.error("Please enter at least one subject.");
      return;
    }
    if (!token) return;

    setPlanBusy(true);
    const goals = user?.preferences?.goals || {};
    const key = `${subjects.join("|").toLowerCase()}::${difficulty.toLowerCase()}`;
    const seq = ++requestSeqRef.current;

    try {
      const res = await apiPost("/ai/study-plan", { subjects, difficulty, goals });
      if (seq !== requestSeqRef.current) return; // ignore stale requests
      setStudyPlan(normalizeStudyPlan(res.plan));
      if (manual) toast.success("Study plan generated!");
      lastAutoKeyRef.current = key;
    } catch (err) {
      if (manual) toast.error(err?.response?.data?.error || "Failed to generate study plan");
    } finally {
      if (seq === requestSeqRef.current) setPlanBusy(false);
    }
  }

  // Auto-generate when user updates subjects (debounced)
  useEffect(() => {
    if (!token) return;
    const subjects = parseSubjects(planSubjects);
    if (subjects.length === 0) return;

    const key = `${subjects.join("|").toLowerCase()}::${difficulty.toLowerCase()}`;
    if (key === lastAutoKeyRef.current) return;

    if (autoGenerateTimerRef.current) clearTimeout(autoGenerateTimerRef.current);
    autoGenerateTimerRef.current = setTimeout(() => {
      generatePlan({ manual: false }).catch(() => {});
    }, 800);

    return () => {
      if (autoGenerateTimerRef.current) clearTimeout(autoGenerateTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSubjects, difficulty, token]);

  async function loadAll() {
    const [s, t] = await Promise.all([
      apiGet("/analytics/summary").catch((e) => {
        throw e;
      }),
      apiGet("/tasks").catch((e) => {
        throw e;
      }),
    ]);

    setSummary(s.summary);
    setTasks(t.tasks || []);

    // Motivation based on weak subject (if available)
    try {
      const weak = s.summary?.latestAnalytics?.weakSubjects?.[0];
      const m = await apiPost("/ai/motivation", { context: { points: s.summary?.latestAnalytics?.points, weakSubject: weak } });
      setMotivation(m.message);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadAll()
      .catch((err) => toast.error(err?.response?.data?.error || "Failed to load dashboard"))
      .finally(() => setLoading(false));
    apiGet("/ai/status").then(setLlmStatus).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(socketUrl, { auth: { token }, transports: ["websocket"] });

    const onRefresh = () => {
      loadAll().catch(() => {});
    };
    socket.on("dashboard:refresh", onRefresh);

    return () => {
      socket.off("dashboard:refresh", onRefresh);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <div className="p-6">Loading dashboard...</div>;

  const latest = summary?.latestAnalytics;
  const weak = latest?.weakSubjects || [];

  const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 5);
  const weeklyTasksDone = (summary?.tasksCompleted || []).slice(-7).reduce((a, b) => a + (b || 0), 0);
  const dailyTargetMinutes = Number(user?.preferences?.goals?.studyTimePerDayMinutes || 60);
  const weeklyTargetTasks = Math.max(1, Math.round((dailyTargetMinutes * 7) / 30));
  const weeklyProgressPct = Math.min(100, Math.round((weeklyTasksDone / weeklyTargetTasks) * 100));

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-cyan-100 dark:from-slate-950 dark:via-indigo-950/40 dark:to-fuchsia-950/30 min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Dashboard
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Your study progress, live countdown, and personalized AI plans.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/tasks" className="text-xs rounded-full px-3 py-1.5 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
              Tasks
            </Link>
            <Link to="/analytics" className="text-xs rounded-full px-3 py-1.5 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
              Analytics
            </Link>
            <Link to="/career" className="text-xs rounded-full px-3 py-1.5 bg-indigo-600 text-white border border-indigo-600">
              AI Career Assistant
            </Link>
            <Link to="/chat" className="text-xs rounded-full px-3 py-1.5 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
              Chatbot
            </Link>
            <Link to="/profile" className="text-xs rounded-full px-3 py-1.5 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
              Profile/Goals
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-violet-300/80 dark:border-violet-900 bg-gradient-to-r from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 p-4 min-w-[190px] shadow-md">
          <div className="text-xs text-slate-500">Current streak</div>
          <div className="text-2xl font-bold">{latest?.streakCount ?? 0} days</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-indigo-300 dark:border-indigo-900 bg-gradient-to-r from-indigo-500/25 to-blue-500/15 p-5 shadow-md">
          <div className="text-xs text-slate-500">Points</div>
          <div className="text-2xl font-bold">{latest?.points ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-900 bg-gradient-to-r from-emerald-500/25 to-lime-500/15 p-5 shadow-md">
          <div className="text-xs text-slate-500">Tasks done</div>
          <div className="text-2xl font-bold">{latest?.tasksCompleted ?? 0}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-300/70 dark:border-emerald-900/40 bg-white/80 dark:bg-slate-900/40 p-5 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">Goal Tracking (Daily / Weekly)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Daily target: {dailyTargetMinutes} min. Weekly task target: {weeklyTargetTasks} tasks.
            </p>
          </div>
          <Link
            to="/profile"
            className="rounded-xl px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Update goals
          </Link>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Weekly completion</span>
            <span>{weeklyTasksDone} / {weeklyTargetTasks} tasks ({weeklyProgressPct}%)</span>
          </div>
          <div className="mt-2 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${weeklyProgressPct}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Weekly tasks completed: <span className="font-semibold">{weeklyTasksDone}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-cyan-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 p-5 shadow-md">
          <h3 className="font-semibold mb-2">Next Tasks</h3>
          {activeTasks.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Add tasks with subjects, and your analytics will get smarter.</p>
          ) : (
            <div className="space-y-2">
              {activeTasks.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/40 dark:bg-slate-950/20 p-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.title}</div>
                    {t.subject && <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Subject: {t.subject}</div>}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${badgeClass(t.priority)}`}>
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-xl bg-indigo-600/10 border border-indigo-500/20 p-3">
            <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">AI next focus</div>
            <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {weak.length ? `Focus on “${weak[0]}” next to improve quickly.` : "Complete tasks with subjects to get weak/strong insights."}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-300/70 dark:border-violet-900/40 bg-white/80 dark:bg-slate-900/40 p-5 shadow-md">
        <h3 className="font-semibold mb-2">AI Suggestions</h3>
        <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {motivation || "Complete a focus session to unlock personalized study guidance and motivation."}
        </p>

        <div className="mt-4 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/40 dark:bg-slate-950/20 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">Generate a personalized study plan</div>
                {llmStatus && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${llmStatus.llmAvailable ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                    {llmStatus.llmAvailable ? `Live AI · ${llmStatus.provider}` : "Smart fallback"}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Type any subject (Python, Docker, React, DSA…) — auto-generates a real topic plan.
              </div>
            </div>
            <button
              type="button"
              disabled={planBusy}
              onClick={() => generatePlan({ manual: true }).catch(() => {})}
              className="rounded-xl px-4 py-2 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white font-semibold transition disabled:opacity-60 shadow-md"
            >
              {planBusy ? "Generating..." : "Generate Plan"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Subjects</span>
              <input
                value={planSubjects}
                onChange={(e) => setPlanSubjects(e.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 dark:bg-slate-800 border border-violet-200/70 dark:border-slate-700 px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-fuchsia-500/50"
                placeholder="e.g. React, SQL, Algorithms"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm"
              >
                <option value="beginner">beginner</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </label>
          </div>

          {parseSubjects(planSubjects).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {parseSubjects(planSubjects).map((s) => (
                <span
                  key={s.toLowerCase()}
                  className="text-xs px-2 py-1 rounded-full bg-fuchsia-500/10 text-fuchsia-900 dark:text-fuchsia-200 border border-fuchsia-500/15"
                >
                  {s}
                </span>
              ))}
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 border border-indigo-500/15">
                {difficulty}
              </span>
            </div>
          )}

          {studyPlan && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-700/40 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 p-4">
                <div className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300 font-semibold">Plan ready</div>
                <div className="text-lg font-bold mt-1">{studyPlan.title}</div>
              </div>

              {studyPlan.weeklySchedule.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Weekly Schedule</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {studyPlan.weeklySchedule.map((day, idx) => (
                      <div
                        key={`${day.weekDay || "day"}-${idx}`}
                        className="rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-950/30 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">{day.weekDay || `Day ${idx + 1}`}</div>
                          <div className="text-xs px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                            {day.timeMinutes || 60} min
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">Subjects</div>
                        <div className="text-sm">{Array.isArray(day.subjects) ? day.subjects.join(", ") : "-"}</div>
                        <div className="mt-2 text-xs text-slate-500">Focus topics</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(day.focusTopics || []).map((topic, tIdx) => (
                            <span
                              key={`${idx}-topic-${tIdx}`}
                              className="text-xs px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 border border-indigo-500/15"
                              title={topic}
                            >
                              {topic.length > 42 ? topic.slice(0, 42) + "..." : topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studyPlan.milestones.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Milestones</div>
                  <div className="space-y-2">
                    {studyPlan.milestones.map((m, idx) => (
                      <div
                        key={`ms-${idx}`}
                        className="rounded-xl border border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-500/5 p-3"
                      >
                        <div className="font-semibold">{m.name || `Milestone ${idx + 1}`}</div>
                        <div className="text-xs text-slate-500 mt-1">{m.targetDateHint || "Upcoming checkpoint"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studyPlan.weaknessChecks.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Weakness Checks</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {studyPlan.weaknessChecks.map((w, idx) => (
                      <div
                        key={`wk-${idx}`}
                        className="rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-amber-500/5 p-3"
                      >
                        <div className="font-semibold">{w.topic || `Topic ${idx + 1}`}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{w.howToAssess}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studyPlan.raw && (
                <div className="text-xs rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-100/70 dark:bg-slate-800/60 p-3 text-slate-600 dark:text-slate-300">
                  {studyPlan.raw}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

