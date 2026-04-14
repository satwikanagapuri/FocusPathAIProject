import React, { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api";
import Nav from "../components/Nav";

const COLORS = [
  { id: "indigo", label: "Indigo", cls: "bg-indigo-500" },
  { id: "violet", label: "Violet", cls: "bg-violet-500" },
  { id: "rose", label: "Rose", cls: "bg-rose-500" },
  { id: "emerald", label: "Emerald", cls: "bg-emerald-500" },
  { id: "amber", label: "Amber", cls: "bg-amber-500" },
  { id: "cyan", label: "Cyan", cls: "bg-cyan-500" },
];

const ICONS = ["📚", "🏃", "🧘", "💧", "✍️", "🎯", "🌿", "🎵", "💤", "🧠", "🥗", "⚡"];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function colorCls(color, type = "bg") {
  const map = {
    indigo: { bg: "bg-indigo-500", light: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-300", ring: "ring-indigo-500" },
    violet: { bg: "bg-violet-500", light: "bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-500" },
    rose: { bg: "bg-rose-500", light: "bg-rose-500/15", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-500" },
    emerald: { bg: "bg-emerald-500", light: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500" },
    amber: { bg: "bg-amber-500", light: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-500" },
    cyan: { bg: "bg-cyan-500", light: "bg-cyan-500/15", text: "text-cyan-700 dark:text-cyan-300", ring: "ring-cyan-500" },
  };
  return map[color]?.[type] || map.indigo[type];
}

export default function HabitsPage() {
  const [habits, setHabits] = useState([]);
  const [streaks, setStreaks] = useState({});
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayKey());
  const [showForm, setShowForm] = useState(false);
  const [editHabit, setEditHabit] = useState(null);

  const [form, setForm] = useState({ name: "", description: "", color: "indigo", icon: "🎯", frequency: "daily" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([
        apiGet("/habits", { date }),
        apiGet("/habits/streaks"),
      ]);
      setHabits(h.habits || []);
      const sm = {};
      for (const { habitId, streak } of s.streaks || []) sm[habitId] = streak;
      setStreaks(sm);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to load habits");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function toggle(habitId, current) {
    try {
      await apiPatch(`/habits/${habitId}/toggle`, { date, done: !current });
      setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, done: !current } : h)));
      if (!current) toast.success("Habit marked done! 🔥");
    } catch {
      toast.error("Failed to update habit");
    }
  }

  async function saveHabit() {
    if (!form.name.trim()) return toast.error("Habit name required");
    setSaving(true);
    try {
      if (editHabit) {
        const { habit } = await apiPut(`/habits/${editHabit.id}`, form);
        setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...habit, done: h.done } : h)));
        toast.success("Habit updated");
      } else {
        const { habit } = await apiPost("/habits", form);
        setHabits((prev) => [...prev, habit]);
        toast.success("Habit created!");
      }
      setShowForm(false);
      setEditHabit(null);
      setForm({ name: "", description: "", color: "indigo", icon: "🎯", frequency: "daily" });
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save habit");
    } finally {
      setSaving(false);
    }
  }

  async function deleteHabit(id) {
    if (!window.confirm("Delete this habit?")) return;
    try {
      await apiDelete(`/habits/${id}`);
      setHabits((prev) => prev.filter((h) => h.id !== id));
      toast.success("Habit deleted");
    } catch {
      toast.error("Failed to delete habit");
    }
  }

  function openEdit(habit) {
    setForm({
      name: habit.name,
      description: habit.description || "",
      color: habit.color || "indigo",
      icon: habit.icon || "🎯",
      frequency: habit.frequency || "daily",
    });
    setEditHabit(habit);
    setShowForm(true);
  }

  const completedCount = habits.filter((h) => h.done).length;
  const completionPct = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-slate-950 dark:via-orange-950/20 dark:to-rose-950/20">
      <Nav />
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-orange-600 via-rose-600 to-fuchsia-600 bg-clip-text text-transparent">
              Habit Tracker
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Build consistency, day by day.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 outline-none"
            />
            <button
              onClick={() => { setShowForm(true); setEditHabit(null); setForm({ name: "", description: "", color: "indigo", icon: "🎯", frequency: "daily" }); }}
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-orange-500 to-rose-500 text-white hover:opacity-90"
            >
              + New Habit
            </button>
          </div>
        </div>

        {habits.length > 0 && (
          <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-white/80 dark:bg-slate-900/40 p-5 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Today's Progress</span>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{completedCount}/{habits.length} done ({completionPct}%)</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            {completionPct === 100 && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold mt-2">🎉 All habits complete for today!</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-500 py-8">Loading habits...</div>
        ) : habits.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
            <div className="text-4xl mb-3">🔥</div>
            <div className="font-semibold">No habits yet</div>
            <div className="text-sm mt-1">Create your first habit to start building streaks</div>
          </div>
        ) : (
          <div className="space-y-3">
            {habits.map((habit) => {
              const streak = streaks[habit.id] || 0;
              return (
                <div
                  key={habit.id}
                  className={`rounded-2xl border p-4 flex items-center gap-4 shadow-sm transition-all ${
                    habit.done
                      ? "border-emerald-300/70 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/20"
                      : "border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40"
                  }`}
                >
                  <button
                    onClick={() => toggle(habit.id, habit.done)}
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                      habit.done
                        ? "bg-emerald-500 shadow-lg shadow-emerald-500/30"
                        : "border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-400"
                    }`}
                  >
                    {habit.done ? "✓" : ""}
                  </button>

                  <div className={`w-3 h-10 rounded-full flex-shrink-0 ${colorCls(habit.color, "bg")}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{habit.icon || "🎯"}</span>
                      <span className={`font-semibold ${habit.done ? "line-through text-slate-400" : ""}`}>{habit.name}</span>
                      {streak > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 font-bold">
                          🔥 {streak}d
                        </span>
                      )}
                    </div>
                    {habit.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{habit.description}</p>
                    )}
                    <span className="text-xs text-slate-400 capitalize">{habit.frequency}</span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(habit)}
                      className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteHabit(habit.id)}
                      className="p-2 rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold">{editHabit ? "Edit Habit" : "New Habit"}</h3>

              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Read for 30 minutes"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What does this habit help you with?"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Icon</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                      className={`text-xl p-1.5 rounded-lg ${form.icon === ic ? "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Color</label>
                <div className="mt-1 flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setForm((f) => ({ ...f, color: c.id }))}
                      className={`w-7 h-7 rounded-full ${c.cls} ${form.color === c.id ? "ring-2 ring-offset-2 ring-slate-400" : ""}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="weekends">Weekends only</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setShowForm(false); setEditHabit(null); }} className="px-4 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Cancel
                </button>
                <button onClick={saveHabit} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-orange-500 to-rose-500 text-white hover:opacity-90 disabled:opacity-60">
                  {saving ? "Saving..." : editHabit ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
