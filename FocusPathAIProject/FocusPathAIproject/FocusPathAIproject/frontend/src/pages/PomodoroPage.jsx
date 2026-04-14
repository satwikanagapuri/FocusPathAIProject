import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { apiPost } from "../lib/api";

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Focus on being productive instead of busy.",
  "Small steps every day lead to big results.",
  "You don't have to be great to start, but you have to start to be great.",
  "Concentrate all your thoughts upon the work at hand.",
  "It always seems impossible until it's done.",
  "The only way to do great work is to love what you do.",
  "Do the hard jobs first. The easy jobs will take care of themselves.",
  "Believe you can and you're halfway there.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Your limitation — it's only your imagination.",
  "Push yourself, because no one else is going to do it for you.",
  "Great things never come from comfort zones.",
  "Dream it. Wish it. Do it.",
  "Stay focused and never give up.",
];

let sharedAudioCtx = null;

function getAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
  return sharedAudioCtx;
}

function beep(ctx, t, freq, dur, gain) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playSound(type) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (type === "start") {
    beep(ctx, now + 0.02, 523, 0.12, 0.12);
    beep(ctx, now + 0.16, 659, 0.12, 0.12);
    beep(ctx, now + 0.30, 784, 0.18, 0.14);
  } else if (type === "end") {
    beep(ctx, now + 0.02, 784, 0.18, 0.14);
    beep(ctx, now + 0.22, 659, 0.15, 0.12);
    beep(ctx, now + 0.40, 523, 0.22, 0.14);
    beep(ctx, now + 0.65, 392, 0.30, 0.12);
  } else if (type === "break") {
    beep(ctx, now + 0.02, 440, 0.14, 0.10);
    beep(ctx, now + 0.20, 494, 0.14, 0.10);
    beep(ctx, now + 0.38, 523, 0.20, 0.12);
  }
}

function formatTime(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function AdjustInput({ label, value, onChange, min = 1, max = 120, disabled }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-bold text-lg flex items-center justify-center disabled:opacity-40 transition"
        >
          −
        </button>
        <span className="w-10 text-center font-bold text-base tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-bold text-lg flex items-center justify-center disabled:opacity-40 transition"
        >
          +
        </button>
      </div>
      <span className="text-xs text-slate-400">min</span>
    </div>
  );
}

export default function PomodoroPage() {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [longBreakEvery, setLongBreakEvery] = useState(4);

  const [stage, setStage] = useState("focus");
  const [sessions, setSessions] = useState(0);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60);

  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));

  const runningRef = useRef(false);
  const stageRef = useRef("focus");
  const sessionsRef = useRef(0);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  function totalSeconds() {
    if (stage === "focus") return focusMin * 60;
    if (stage === "break") return breakMin * 60;
    return longBreakMin * 60;
  }

  useEffect(() => {
    if (!running) {
      if (stage === "focus") setRemaining(focusMin * 60);
      else if (stage === "break") setRemaining(breakMin * 60);
      else setRemaining(longBreakMin * 60);
    }
  }, [focusMin, breakMin, longBreakMin]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    handleComplete();
  }, [remaining, running]);

  async function handleComplete() {
    setRunning(false);
    playSound("end");

    const curStage = stageRef.current;
    if (curStage === "focus") {
      const next = sessionsRef.current + 1;
      setSessions(next);
      sessionsRef.current = next;

      try { await apiPost("/analytics/pomodoro/complete", {}); } catch { }

      toast.success("Focus session complete! Take a break.");
      setQuoteIdx(Math.floor(Math.random() * QUOTES.length));

      const isLong = next % longBreakEvery === 0;
      const nextStage = isLong ? "long_break" : "break";
      setStage(nextStage);
      stageRef.current = nextStage;
      setRemaining(isLong ? longBreakMin * 60 : breakMin * 60);

      setTimeout(() => {
        playSound("break");
        setRunning(true);
      }, 800);
    } else {
      toast.info(curStage === "long_break" ? "Long break over! Time to focus." : "Break over! Back to focus.");
      setStage("focus");
      stageRef.current = "focus";
      setRemaining(focusMin * 60);
      setTimeout(() => {
        playSound("start");
        setRunning(true);
      }, 800);
    }
  }

  function handleStart() {
    playSound("start");
    setRunning(true);
  }

  function handlePause() {
    setRunning(false);
  }

  function handleReset() {
    setRunning(false);
    setStage("focus");
    setSessions(0);
    setRemaining(focusMin * 60);
  }

  function handleSkip() {
    setRunning(false);
    if (stage === "focus") {
      const next = sessions + 1;
      setSessions(next);
      const isLong = next % longBreakEvery === 0;
      const nextStage = isLong ? "long_break" : "break";
      setStage(nextStage);
      setRemaining(isLong ? longBreakMin * 60 : breakMin * 60);
    } else {
      setStage("focus");
      setRemaining(focusMin * 60);
    }
  }

  const pct = Math.max(0, Math.min(1, 1 - remaining / Math.max(1, totalSeconds())));
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  const stageLabel =
    stage === "focus" ? "Focus" : stage === "break" ? "Short Break" : "Long Break";

  const stageColor =
    stage === "focus"
      ? { ring: "#6366f1", bg: "from-indigo-500/20 via-violet-500/20 to-fuchsia-500/20", text: "text-indigo-600 dark:text-indigo-300" }
      : stage === "break"
      ? { ring: "#22c55e", bg: "from-emerald-500/20 via-teal-500/20 to-cyan-500/20", text: "text-emerald-600 dark:text-emerald-300" }
      : { ring: "#f59e0b", bg: "from-amber-500/20 via-orange-500/20 to-yellow-500/20", text: "text-amber-600 dark:text-amber-300" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-cyan-100 dark:from-slate-950 dark:via-indigo-950/40 dark:to-fuchsia-950/30 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Pomodoro Timer
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Stay focused, take breaks, and keep building momentum.
          </p>
        </div>

        <div className={`rounded-3xl border border-white/60 dark:border-slate-800 bg-gradient-to-br ${stageColor.bg} backdrop-blur p-8 shadow-xl flex flex-col items-center gap-6`}>

          <div className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
            stage === "focus" ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
            : stage === "break" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}>
            {stageLabel}
          </div>

          <div className="relative w-52 h-52 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-800" />
              <circle
                cx="100" cy="100" r={radius}
                fill="none"
                stroke={stageColor.ring}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="flex flex-col items-center">
              <div className="text-5xl font-extrabold tabular-nums">{formatTime(remaining)}</div>
              <div className={`text-xs font-semibold mt-1 ${stageColor.text}`}>{stageLabel}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            {!running ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={remaining <= 0}
                className="px-8 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white font-bold text-base shadow-lg disabled:opacity-50 transition"
              >
                ▶ Start
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="px-8 py-3 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-800/40 text-amber-900 dark:text-amber-100 font-bold text-base transition"
              >
                ⏸ Pause
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              className="px-5 py-3 rounded-2xl bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200 transition"
            >
              ⏭ Skip
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-3 rounded-2xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-800/40 text-rose-700 dark:text-rose-200 font-semibold transition"
            >
              ↺ Reset
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium">Sessions completed:</span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-300 text-lg">{sessions}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 p-6 shadow-md">
          <h3 className="font-bold text-base mb-4">Timer Settings</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 justify-items-center">
            <AdjustInput
              label="Focus"
              value={focusMin}
              onChange={(v) => { setFocusMin(v); if (!running && stage === "focus") setRemaining(v * 60); }}
              min={5} max={90}
              disabled={running}
            />
            <AdjustInput
              label="Short Break"
              value={breakMin}
              onChange={(v) => { setBreakMin(v); if (!running && stage === "break") setRemaining(v * 60); }}
              min={1} max={30}
              disabled={running}
            />
            <AdjustInput
              label="Long Break"
              value={longBreakMin}
              onChange={(v) => { setLongBreakMin(v); if (!running && stage === "long_break") setRemaining(v * 60); }}
              min={5} max={60}
              disabled={running}
            />
            <AdjustInput
              label="Long every"
              value={longBreakEvery}
              onChange={setLongBreakEvery}
              min={2} max={10}
              disabled={running}
            />
          </div>
          {running && <p className="text-xs text-slate-500 text-center mt-4">Pause the timer to adjust settings.</p>}
        </div>

        <div className="rounded-2xl border border-violet-300/50 dark:border-violet-900/50 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-indigo-500/10 p-6 shadow-md">
          <div className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-3">
            Motivation
          </div>
          <p className="text-base font-medium text-slate-700 dark:text-slate-200 italic leading-relaxed">
            "{QUOTES[quoteIdx]}"
          </p>
          <button
            type="button"
            onClick={() => setQuoteIdx((i) => (i + 1) % QUOTES.length)}
            className="mt-3 text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            Next quote →
          </button>
        </div>

        <div className="rounded-2xl border border-white/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 p-5 shadow-md">
          <h3 className="font-bold text-sm mb-3">How it works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 p-3">
              <div className="font-bold text-indigo-700 dark:text-indigo-300 mb-1">1. Focus</div>
              Work for the set duration without distractions. A sound plays when the session starts.
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 p-3">
              <div className="font-bold text-emerald-700 dark:text-emerald-300 mb-1">2. Break</div>
              Rest and recharge. Short breaks after each session, long break every few sessions.
            </div>
            <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-400/20 p-3">
              <div className="font-bold text-fuchsia-700 dark:text-fuchsia-300 mb-1">3. Repeat</div>
              Keep cycling. Each completed session is counted and tracked in your analytics.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
