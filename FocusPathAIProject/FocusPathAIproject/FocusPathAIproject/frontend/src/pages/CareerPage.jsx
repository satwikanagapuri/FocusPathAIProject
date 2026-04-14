import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";

import { apiPost } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

export default function CareerPage() {
  const user = useAuthStore((s) => s.user);

  const [guidanceBusy, setGuidanceBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);

  const [objectiveText, setObjectiveText] = useState(
    user?.preferences?.careerObjectives?.objectiveText ||
      "I want to become a frontend engineer and get an internship/job in 6 months.",
  );

  const [backgroundText, setBackgroundText] = useState(
    [
      user?.displayName ? `My name is ${user.displayName}.` : "",
      user?.preferences?.goals?.focusSubjects?.length
        ? `I’m studying: ${user.preferences.goals.focusSubjects.join(", ")}.`
        : "",
      "I mainly struggle with consistency and converting theory into projects.",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const [guidance, setGuidance] = useState(null);

  const [resumeText, setResumeText] = useState("");
  const [targetRoleText, setTargetRoleText] = useState("Frontend Developer (React) – entry level");
  const [extraNotesText, setExtraNotesText] = useState("Target: remote-friendly roles, startup or product-based company.");
  const [resumeFeedback, setResumeFeedback] = useState(null);

  const hasGuidance = useMemo(() => !!guidance, [guidance]);
  const hasResumeFeedback = useMemo(() => !!resumeFeedback, [resumeFeedback]);

  async function onGenerateGuidance() {
    const trimmedObjective = objectiveText.trim();
    if (!trimmedObjective) {
      toast.error("Add at least one sentence about your career objective.");
      return;
    }

    setGuidanceBusy(true);
    try {
      const payload = {
        careerObjective: { objectiveText: trimmedObjective },
        background: { backgroundText: backgroundText.trim() || undefined },
      };
      const res = await apiPost("/ai/career-guidance", payload);
      setGuidance(res.guidance || null);
      toast.success("Career guidance generated.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to generate guidance");
    } finally {
      setGuidanceBusy(false);
    }
  }

  async function onAnalyzeResume() {
    const text = resumeText.trim();
    if (!text) {
      toast.error("Paste your resume text first.");
      return;
    }
    setResumeBusy(true);
    try {
      const payload = {
        resumeText: text,
        targetRole: { role: targetRoleText.trim() || "Software Engineer" },
        extraNotes: extraNotesText.trim() ? { notes: extraNotesText.trim() } : undefined,
      };
      const res = await apiPost("/ai/resume-optimization", payload);
      setResumeFeedback(res.feedback || null);
      toast.success("Resume reviewed.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to analyze resume");
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-cyan-100 dark:from-slate-950 dark:via-indigo-950/40 dark:to-fuchsia-950/30 min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Career Guidance & Resume
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Turn your study work into a clear roadmap, skills plan, and recruiter-facing resume.
          </p>
        </div>
        <div className="rounded-2xl border border-violet-300/80 dark:border-violet-900 bg-white/60 dark:bg-slate-950/40 px-4 py-3 text-xs">
          <div className="font-semibold text-slate-800 dark:text-slate-100">AI Career Assistant</div>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Use this screen in demos to show career paths, skills, and ATS-ready resume tips.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 backdrop-blur p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Career Guidance</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Describe your target role and background. Get paths, skills, and roadmap.
              </p>
            </div>
            <button
              type="button"
              onClick={onGenerateGuidance}
              disabled={guidanceBusy}
              className="rounded-xl px-4 py-2 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white text-sm font-semibold disabled:opacity-60 shadow-md"
            >
              {guidanceBusy ? "Generating..." : "Generate plan"}
            </button>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Career objective</span>
            <textarea
              value={objectiveText}
              onChange={(e) => setObjectiveText(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm min-h-[80px]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Background (skills, education, gaps)</span>
            <textarea
              value={backgroundText}
              onChange={(e) => setBackgroundText(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm min-h-[80px]"
            />
          </label>

          {hasGuidance && (
            <div className="mt-2 space-y-4">
              {Array.isArray(guidance.paths) && guidance.paths.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Career paths that fit you</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {guidance.paths.map((p, idx) => (
                      <div
                        key={`${p.name || "path"}-${idx}`}
                        className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/60 bg-indigo-500/5 dark:bg-indigo-950/40 p-3"
                      >
                        <div className="font-semibold text-sm">{p.name || "Path"}</div>
                        {p.whyItFits && (
                          <div className="text-xs text-slate-700 dark:text-slate-200 mt-1">{p.whyItFits}</div>
                        )}
                        {Array.isArray(p.targetRoleExamples) && p.targetRoleExamples.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {p.targetRoleExamples.map((r, rIdx) => (
                              <span
                                key={`${idx}-role-${rIdx}`}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(guidance.requiredSkills) && guidance.requiredSkills.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Skills to learn</div>
                  <div className="flex flex-wrap gap-1.5">
                    {guidance.requiredSkills.map((s, idx) => (
                      <span
                        key={`${s}-${idx}`}
                        className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(guidance.learningRoadmap) && guidance.learningRoadmap.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Learning roadmap</div>
                  <div className="space-y-3">
                    {guidance.learningRoadmap.map((phase, idx) => (
                      <div
                        key={`${phase.phase || "phase"}-${idx}`}
                        className="rounded-xl border border-fuchsia-200/70 dark:border-fuchsia-800/60 bg-fuchsia-500/5 dark:bg-fuchsia-950/40 p-3"
                      >
                        <div className="font-semibold text-sm">{phase.phase || `Phase ${idx + 1}`}</div>
                        {Array.isArray(phase.focusAreas) && phase.focusAreas.length > 0 && (
                          <div className="mt-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Focus</div>
                            <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-200 space-y-0.5">
                              {phase.focusAreas.map((f, fIdx) => (
                                <li key={`${idx}-f-${fIdx}`}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(phase.practiceIdeas) && phase.practiceIdeas.length > 0 && (
                          <div className="mt-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Practice ideas</div>
                            <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-200 space-y-0.5">
                              {phase.practiceIdeas.map((idea, iIdx) => (
                                <li key={`${idx}-p-${iIdx}`}>{idea}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40 backdrop-blur p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Resume Analyzer</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Paste your resume text and get ATS keywords, bullet fixes, and next steps.
              </p>
            </div>
            <button
              type="button"
              onClick={onAnalyzeResume}
              disabled={resumeBusy}
              className="rounded-xl px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white text-sm font-semibold disabled:opacity-60 shadow-md"
            >
              {resumeBusy ? "Analyzing..." : "Analyze resume"}
            </button>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Target role</span>
            <input
              value={targetRoleText}
              onChange={(e) => setTargetRoleText(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Extra notes (optional)</span>
            <input
              value={extraNotesText}
              onChange={(e) => setExtraNotesText(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Resume text</span>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none text-sm min-h-[140px]"
              placeholder="Paste your resume text here (you can export from PDF as text)."
            />
          </label>

          {hasResumeFeedback && (
            <div className="mt-3 space-y-3">
              {resumeFeedback.summary && (
                <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/60 bg-indigo-500/5 dark:bg-indigo-950/40 p-3 text-sm text-slate-800 dark:text-slate-100">
                  {resumeFeedback.summary}
                </div>
              )}

              {Array.isArray(resumeFeedback.atsKeywords) && resumeFeedback.atsKeywords.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">ATS keywords</div>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeFeedback.atsKeywords.map((k, idx) => (
                      <span
                        key={`${k}-${idx}`}
                        className="text-xs px-2 py-1 rounded-full bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(resumeFeedback.bulletEdits) && resumeFeedback.bulletEdits.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Bullet improvements</div>
                  <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                    {resumeFeedback.bulletEdits.map((b, idx) => (
                      <div
                        key={`b-${idx}`}
                        className="rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-900/60 p-2"
                      >
                        {b.originalHint && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Original: {b.originalHint}
                          </div>
                        )}
                        <div className="font-semibold">{b.improvedBullet}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(resumeFeedback.linkedinTips) && resumeFeedback.linkedinTips.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">LinkedIn tips</div>
                  <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-200 space-y-0.5">
                    {resumeFeedback.linkedinTips.map((t, idx) => (
                      <li key={`l-${idx}`}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(resumeFeedback.nextSteps) && resumeFeedback.nextSteps.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Next actions</div>
                  <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-200 space-y-0.5">
                    {resumeFeedback.nextSteps.map((n, idx) => (
                      <li key={`n-${idx}`}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

