import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { io } from "socket.io-client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

import { useAuthStore } from "../store/useAuthStore";
import { apiGet, apiPost } from "../lib/api";

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export default function AnalyticsPage() {
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [motivation, setMotivation] = useState(null);

  async function load() {
    try {
      const data = await apiGet("/analytics/summary");
      setSummary(data.summary);

      try {
        const m = await apiPost("/ai/motivation", { context: { points: data.summary?.latestAnalytics?.points } });
        setMotivation(m.message);
      } catch {
        // ignore
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
    });

    const onRefresh = () => load();
    socket.on("dashboard:refresh", onRefresh);

    return () => {
      socket.off("dashboard:refresh", onRefresh);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const chartData = useMemo(() => {
    if (!summary) return [];
    const labels = summary.labels || [];
    return labels.map((label, idx) => ({
      label,
      points: summary.points?.[idx] ?? 0,
      streak: summary.streak?.[idx] ?? 0,
      tasksCompleted: summary.tasksCompleted?.[idx] ?? 0,
    }));
  }, [summary]);

  if (loading) return <div className="p-6">Loading analytics...</div>;

  const latest = summary?.latestAnalytics;
  const weak = latest?.weakSubjects || [];
  const strong = latest?.strongSubjects || [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Analytics & Reports</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Progress analytics, streaks, and subject insights.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <div className="text-xs text-slate-500">Latest Points</div>
          <div className="text-3xl font-extrabold">{latest?.points ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <div className="text-xs text-slate-500">Current Streak</div>
          <div className="text-3xl font-extrabold">{latest?.streakCount ?? 0} days</div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <div className="text-xs text-slate-500">Tasks Completed</div>
          <div className="text-3xl font-extrabold">{latest?.tasksCompleted ?? 0}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
        <h3 className="font-semibold mb-2">Points Trend</h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={20} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="points" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-2">Streak Growth</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={20} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="streak" stroke="#14b8a6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-2">Tasks Completed</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={20} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tasksCompleted" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-2">Weak Subjects</h3>
          {weak.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Complete tasks with subjects to see insights.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {weak.map((s) => (
                <span key={s} className="text-xs font-bold px-3 py-1 rounded-full bg-red-500/15 text-red-700 dark:text-red-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
          <h3 className="font-semibold mb-2">Strong Subjects</h3>
          {strong.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Complete tasks with subjects to see insights.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {strong.map((s) => (
                <span key={s} className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
        <h3 className="font-semibold mb-2">AI Motivation</h3>
        <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{motivation || "Complete a focus session to get personalized motivation."}</p>
      </div>
    </div>
  );
}


