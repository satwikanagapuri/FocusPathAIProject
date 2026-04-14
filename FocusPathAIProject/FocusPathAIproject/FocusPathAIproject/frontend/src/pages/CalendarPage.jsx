import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import Nav from "../components/Nav";

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function priorityColor(priority) {
  if (priority === "high") return "bg-rose-500";
  if (priority === "medium") return "bg-amber-500";
  return "bg-emerald-500";
}

function statusTextColor(status) {
  if (status === "done") return "line-through text-slate-400 dark:text-slate-500";
  if (status === "in_progress") return "text-blue-700 dark:text-blue-300";
  return "";
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiGet("/tasks")
      .then(({ tasks: data }) => setTasks(data || []))
      .catch(() => toast.error("Failed to load tasks"))
      .finally(() => setLoading(false));
  }, []);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelected(null);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelected(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelected(null);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const tasksByDate = {};
  for (const task of tasks) {
    if (!task.deadline) continue;
    const d = new Date(task.deadline);
    if (isNaN(d)) continue;
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!tasksByDate[day]) tasksByDate[day] = [];
      tasksByDate[day].push(task);
    }
  }

  const selectedTasks = selected ? (tasksByDate[selected] || []) : [];
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const upcomingTasks = tasks
    .filter((t) => t.deadline && t.status !== "done")
    .map((t) => ({ ...t, deadlineDate: new Date(t.deadline) }))
    .filter((t) => !isNaN(t.deadlineDate) && t.deadlineDate >= today)
    .sort((a, b) => a.deadlineDate - b.deadlineDate)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/20">
      <Nav />
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Study Calendar
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Visual view of your tasks and deadlines.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/tasks" className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800">
              + Add Task
            </Link>
            <button onClick={goToday} className="text-xs px-3 py-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700">
              Today
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 p-5 shadow">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                ←
              </button>
              <h2 className="text-lg font-bold">{MONTH_NAMES[month]} {year}</h2>
              <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                →
              </button>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  const hasTasks = tasksByDate[day]?.length > 0;
                  const isSelected = selected === day;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelected(isSelected ? null : day)}
                      className={`relative aspect-square rounded-xl flex flex-col items-center justify-start pt-1 text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : isToday
                          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500"
                          : hasTasks
                          ? "bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {day}
                      {hasTasks && (
                        <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                          {(tasksByDate[day] || []).slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : priorityColor(t.priority)}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {selected && (
              <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-800/60 bg-white/80 dark:bg-slate-900/40 p-4 shadow">
                <h3 className="font-semibold mb-3">
                  {MONTH_NAMES[month]} {selected}, {year}
                </h3>
                {selectedTasks.length === 0 ? (
                  <p className="text-sm text-slate-500">No tasks due on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTasks.map((t) => (
                      <div key={t.id} className="rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-800/50 p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColor(t.priority)}`} />
                          <span className={`text-sm font-medium ${statusTextColor(t.status)}`}>{t.title}</span>
                        </div>
                        {t.subject && <div className="text-xs text-slate-500 mt-1">📚 {t.subject}</div>}
                        <div className="text-xs text-slate-400 mt-0.5 capitalize">{t.status.replace("_", " ")} · {t.priority}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 p-4 shadow">
              <h3 className="font-semibold mb-3">Upcoming Deadlines</h3>
              {upcomingTasks.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming deadlines.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingTasks.map((t) => {
                    const daysLeft = Math.ceil((t.deadlineDate - today) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={t.id} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColor(t.priority)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{t.title}</div>
                          <div className="text-xs text-slate-400">{isNaN(t.deadlineDate) ? "" : t.deadlineDate.toLocaleDateString()}</div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          daysLeft <= 1 ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" :
                          daysLeft <= 3 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        }`}>
                          {daysLeft === 0 ? "today" : `${daysLeft}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link to="/tasks" className="mt-3 block text-xs text-center text-indigo-600 dark:text-indigo-400 hover:underline">
                Manage all tasks →
              </Link>
            </div>

            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 p-4 shadow">
              <h3 className="font-semibold mb-2 text-sm">Legend</h3>
              <div className="space-y-1.5">
                {[{ color: "bg-rose-500", label: "High priority" }, { color: "bg-amber-500", label: "Medium priority" }, { color: "bg-emerald-500", label: "Low priority" }].map((l) => (
                  <div key={l.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
