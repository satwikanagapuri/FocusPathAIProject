import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { toast } from "react-toastify";

import { useAuthStore } from "../store/useAuthStore";
import { apiGet, apiPost } from "../lib/api";
import Nav from "../components/Nav";

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

const QUICK_PROMPTS = [
  "How do I learn Python from scratch?",
  "Give me a 4-week React study plan.",
  "How do I crack a software engineering interview?",
  "What is the difference between SQL and NoSQL?",
  "How do I get into machine learning?",
  "Explain Docker containers with an example.",
  "What is system design and how do I prepare for it?",
  "How do I become a full-stack developer?",
];

function MessageBubble({ m }) {
  const isUser = m.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
          AI
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white rounded-tr-sm"
            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-sm"
        }`}
      >
        {m.text}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      from: "ai",
      text: "Hi! I'm FocusPath AI. Ask me anything — study plans, career advice, specific topics like Python or System Design, interview prep, or motivation. I'm here to help!",
    },
  ]);
  const [input, setInput] = useState("");
  const idSeqRef = useRef(0);

  const userContext = useMemo(
    () => ({
      displayName: user?.displayName,
      goals: user?.preferences?.goals,
      careerObjectives: user?.preferences?.careerObjectives,
    }),
    [user],
  );

  useEffect(() => {
    if (!token) return;
    apiGet("/ai/status")
      .then((d) => setLlmStatus(d))
      .catch(() => setLlmStatus({ llmAvailable: false, provider: "none" }));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(socketUrl, {
      autoConnect: true,
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("chat:response", (payload) => {
      const { response } = payload || {};
      if (!response) return;
      setBusy(false);
      setMessages((prev) => [
        ...prev,
        { id: `${payload.requestId || Date.now()}-ai`, from: "ai", text: response },
      ]);
    });
    socket.on("connect_error", () => setConnected(false));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function sendMessage(text) {
    const trimmed = (text || input).trim();
    if (!trimmed || busy) return;
    setInput("");
    setBusy(true);

    idSeqRef.current += 1;
    const requestId = `${Date.now()}-${idSeqRef.current}`;
    const newMsg = { id: requestId, from: "user", text: trimmed };
    setMessages((prev) => [...prev, newMsg]);

    const history = messages.concat(newMsg);

    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit("chat:message", { message: trimmed, requestId, userContext, history });
      return;
    }

    try {
      const res = await apiPost("/ai/chat", { message: trimmed, userContext, history });
      setBusy(false);
      setMessages((prev) => [
        ...prev,
        { id: `${requestId}-rest`, from: "ai", text: res.response },
      ]);
    } catch (err) {
      setBusy(false);
      toast.error(err?.response?.data?.error || "Chat failed");
    }
  }

  const statusColor = llmStatus?.llmAvailable
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-300";

  const statusText = llmStatus?.llmAvailable
    ? `AI: ${llmStatus.provider}`
    : "AI: Smart fallback (add GROQ_API_KEY for live AI)";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <Nav />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Chatbot</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ask anything — real answers based on your input</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>
              {statusText}
            </span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-200/60 text-slate-500"}`}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>

        {!llmStatus?.llmAvailable && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>Tip:</strong> Get a free Groq API key at{" "}
            <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline font-semibold">
              console.groq.com
            </a>{" "}
            and add it as <code className="bg-amber-100 dark:bg-amber-800/40 px-1 rounded font-mono text-xs">GROQ_API_KEY</code> in your environment to enable live LLaMA 3 AI responses.
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur shadow-sm flex flex-col" style={{ height: "65vh" }}>
          <div className="flex-1 overflow-auto p-5 space-y-3">
            {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
            {busy && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">AI</div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-200/60 dark:border-slate-800/60 p-4 space-y-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about any topic, study plan, career path, or concept..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendMessage(); }}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || busy}
                className="rounded-xl px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition"
              >
                Send
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={busy}
                  className="text-xs rounded-full px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition disabled:opacity-50"
                >
                  {q.length > 32 ? q.slice(0, 30) + "…" : q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
