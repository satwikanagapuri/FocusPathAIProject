import React, { useState } from "react";
import { toast } from "react-toastify";
import { apiPost } from "../lib/api";
import Nav from "../components/Nav";

const QUICK_TOPICS = [
  "Python", "JavaScript", "React", "SQL", "DSA", "Java", "C++",
  "Machine Learning", "Node.js", "Git", "TypeScript", "Docker",
];

function FlipCard({ card, index, total }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ perspective: "1200px" }}
      onClick={() => setFlipped((f) => !f)}
    >
      <div
        className="relative w-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: "220px",
        }}
      >
        <div
          className="absolute inset-0 rounded-2xl border border-indigo-200/70 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 p-6 flex flex-col justify-between shadow-md"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-xs text-indigo-500 font-semibold uppercase tracking-wider">Question {index + 1}/{total}</div>
          <div className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center my-4 leading-relaxed">{card.front}</div>
          <div className="text-xs text-center text-slate-400">Tap to reveal answer</div>
        </div>

        <div
          className="absolute inset-0 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 p-6 flex flex-col justify-between shadow-md"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">Answer</div>
          <div className="text-base text-slate-800 dark:text-slate-100 text-center my-4 leading-relaxed font-mono">{card.back}</div>
          <div className="text-xs text-center text-slate-400">Tap to flip back</div>
        </div>
      </div>
    </div>
  );
}

export default function FlashcardsPage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatedTopic, setGeneratedTopic] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [mode, setMode] = useState("grid");
  const [known, setKnown] = useState(new Set());

  async function generate(topicOverride) {
    const t = (topicOverride || topic).trim();
    if (!t) return toast.error("Please enter a topic");
    setLoading(true);
    setCards([]);
    setCurrentIdx(0);
    setKnown(new Set());
    try {
      const { cards: data, topic: returnedTopic } = await apiPost("/ai/flashcards", { topic: t, count });
      setCards(data || []);
      setGeneratedTopic(returnedTopic || t);
      if ((data || []).length === 0) toast.info("No cards generated, try a different topic");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to generate flashcards");
    } finally {
      setLoading(false);
    }
  }

  function markKnown(idx) {
    setKnown((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  const studyCards = cards.filter((_, i) => !known.has(i));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-violet-950/20">
      <Nav />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
            AI Flashcards
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Generate smart flashcards for any topic instantly.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 p-5 shadow space-y-4">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Enter a topic (e.g. Python closures, React hooks, SQL joins...)"
              className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
            />
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none"
            >
              {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} cards</option>)}
            </select>
            <button
              onClick={() => generate()}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate ✨"}
            </button>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">Quick topics:</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTopic(t); generate(t); }}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors disabled:opacity-50"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {cards.length > 0 && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-lg">{generatedTopic}</span>
                <span className="text-sm text-slate-500 ml-2">· {cards.length} cards</span>
                {known.size > 0 && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 ml-2">· {known.size} known</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("grid")}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${mode === "grid" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => { setMode("study"); setCurrentIdx(0); }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${mode === "study" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
                >
                  Study Mode
                </button>
                {known.size > 0 && (
                  <button
                    onClick={() => setKnown(new Set())}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {mode === "grid" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cards.map((card, idx) => (
                  <div key={idx} className={`relative ${known.has(idx) ? "opacity-50" : ""}`}>
                    <FlipCard card={card} index={idx} total={cards.length} />
                    <button
                      onClick={() => markKnown(idx)}
                      className={`absolute top-3 right-3 text-xs px-2 py-1 rounded-full font-semibold transition-colors ${
                        known.has(idx)
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-200/80 dark:bg-slate-800/80 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                      }`}
                    >
                      {known.has(idx) ? "✓ Known" : "Mark known"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {mode === "study" && (
              <div className="space-y-4">
                {studyCards.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="text-4xl mb-3">🎉</div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400">All cards marked as known!</div>
                    <button onClick={() => setKnown(new Set())} className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                      Reset and study again
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center text-sm text-slate-500">
                      Card {currentIdx + 1} of {studyCards.length} remaining
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                        style={{ width: `${((currentIdx) / studyCards.length) * 100}%` }}
                      />
                    </div>
                    <FlipCard
                      card={studyCards[currentIdx]}
                      index={cards.indexOf(studyCards[currentIdx])}
                      total={cards.length}
                    />
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => { const i = cards.indexOf(studyCards[currentIdx]); markKnown(i); if (currentIdx >= studyCards.length - 1) setCurrentIdx(0); }}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
                      >
                        ✓ I know this
                      </button>
                      <button
                        onClick={() => setCurrentIdx((i) => (i + 1) % studyCards.length)}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                      >
                        Next →
                      </button>
                      {currentIdx > 0 && (
                        <button
                          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                          className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          ← Back
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {!loading && cards.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
            <div className="text-5xl mb-4">🃏</div>
            <div className="font-semibold text-lg">Generate your first flashcard set</div>
            <div className="text-sm mt-2">Enter any topic above or pick a quick topic to get started</div>
          </div>
        )}
      </div>
    </div>
  );
}
