const express = require("express");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const mem = require("../store/memoryStore");
const {
  generateStudyPlan,
  generateCareerGuidance,
  generateMotivation,
  generateResumeOptimization,
  chatAssistant,
  generateFlashcards,
  isLLMAvailable,
} = require("../services/ai.service");
const { getProviderName } = require("../services/openai.service");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

router.post("/study-plan", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      subjects: z.array(z.string().min(1)).min(1),
      difficulty: z.string().min(1).optional(),
      goals: z.record(z.string(), z.unknown()).optional(),
      title: z.string().optional(),
    });
    const { subjects, difficulty, goals, title } = schema.parse(req.body);

    const plan = await generateStudyPlan({ userId: req.user.id, subjects, difficulty, goals });
    const created = DEMO_MODE
      ? mem.createStudyPlan(req.user.id, title || plan.title || "FocusPath Study Plan", plan)
      : await prisma.studyPlan.create({
          data: {
            userId: req.user.id,
            title: title || plan.title || "FocusPath Study Plan",
            planJson: plan,
          },
        });
    res.json({ plan: created.planJson });
  } catch (err) {
    next(err);
  }
});

router.post("/career-guidance", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      careerObjective: z.record(z.string(), z.unknown()).optional(),
      background: z.record(z.string(), z.unknown()).optional(),
    });
    const { careerObjective, background } = schema.parse(req.body);

    const guidance = await generateCareerGuidance({ userId: req.user.id, careerObjective, background });
    res.json({ guidance });
  } catch (err) {
    next(err);
  }
});

router.post("/motivation", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      context: z.record(z.string(), z.unknown()).optional(),
    });
    const { context } = schema.parse(req.body);
    const message = await generateMotivation({ userId: req.user.id, context });
    res.json({ message });
  } catch (err) {
    next(err);
  }
});

router.post("/resume-optimization", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      resumeText: z.string().min(1),
      targetRole: z.record(z.string(), z.unknown()).optional(),
      extraNotes: z.record(z.string(), z.unknown()).optional(),
    });
    const { resumeText, targetRole, extraNotes } = schema.parse(req.body);

    const feedback = await generateResumeOptimization({
      userId: req.user.id,
      resumeText,
      targetRole,
      extraNotes,
    });
    res.json({ feedback });
  } catch (err) {
    next(err);
  }
});

router.get("/status", requireAuth, (req, res) => {
  res.json({
    llmAvailable: isLLMAvailable(),
    provider: getProviderName(),
  });
});

router.post("/chat", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      message: z.string().min(1),
      userContext: z.record(z.string(), z.unknown()).optional(),
      history: z.array(z.object({
        from: z.string(),
        text: z.string(),
      })).optional(),
    });
    const { message, userContext, history } = schema.parse(req.body);

    const response = await chatAssistant({
      userId: req.user.id,
      message,
      userContext,
      history: history || [],
    });
    res.json({ response });
  } catch (err) {
    next(err);
  }
});

router.post("/flashcards", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      topic: z.string().min(1).max(100),
      count: z.coerce.number().int().min(1).max(20).optional(),
    });
    const { topic, count = 8 } = schema.parse(req.body);

    const cards = await generateFlashcards({ userId: req.user.id, topic, count });
    res.json({ cards, topic });
  } catch (err) {
    next(err);
  }
});

router.get("/logs", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const type = req.query.type;
    const where = { userId: req.user.id };
    if (type) where.type = type;

    const logs = DEMO_MODE
      ? mem.listAiLogs(req.user.id, type).slice(0, limit)
      : await (() => {
          const delegate = prisma.AI_Logs || prisma.aI_Logs;
          if (!delegate) throw new Error("Prisma AI_Logs delegate not found");
          return delegate.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
          });
        })();

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

