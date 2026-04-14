import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { apiPost } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const queryMode = new URLSearchParams(location.search).get("mode");
  const initialMode = queryMode === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, displayName: displayName || undefined };

      const data = await apiPost(endpoint, body);
      setAuth({ token: data.token, user: data.user });
      toast.success(mode === "login" ? "Welcome back!" : "Account created!");
      navigate("/dashboard");
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Request failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-cyan-100 dark:from-slate-950 dark:via-indigo-950/40 dark:to-fuchsia-950/30">
      <div className="w-full max-w-md rounded-3xl bg-white/80 dark:bg-slate-900/70 backdrop-blur border border-violet-200/70 dark:border-violet-900/40 p-6 shadow-2xl">
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            FocusPath AI
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Study smarter. Build a career plan. Stay motivated.
          </p>
          <div className="mt-3 text-xs text-slate-500">
            <span className="font-semibold">No account?</span>{" "}
            <Link to="/signup" className="text-indigo-600 dark:text-indigo-300 underline">
              Create one
            </Link>
            {"  |  "}
            <Link to="/login" className="text-indigo-600 dark:text-indigo-300 underline">
              Go to login
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "login"
                ? "bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white"
                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "register"
                ? "bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white"
                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              className="mt-1 w-full rounded-xl bg-white/90 dark:bg-slate-800 border border-violet-200/70 dark:border-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500/60"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              className="mt-1 w-full rounded-xl bg-white/90 dark:bg-slate-800 border border-violet-200/70 dark:border-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500/60"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {mode === "register" && (
            <label className="block">
              <span className="text-sm font-medium">Display Name (optional)</span>
              <input
                className="mt-1 w-full rounded-xl bg-white/90 dark:bg-slate-800 border border-violet-200/70 dark:border-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500/60"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                type="text"
                maxLength={80}
              />
            </label>
          )}

          <button
            disabled={busy}
            className="w-full mt-2 rounded-xl px-4 py-2 font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white disabled:opacity-60 transition shadow-md"
          >
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>

          <p className="text-xs text-slate-500">
            By continuing, you agree to use this app for study and career planning.
          </p>
        </form>
      </div>
    </div>
  );
}

