const express = require("express");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { generateStudyPlan } = require("../services/ai.service");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const plans = DEMO_MODE
      ? mem.listStudyPlans(req.user.id).slice(0, 10)
      : await prisma.studyPlan.findMany({
          where: { userId: req.user.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

router.post("/generate", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      subjects: z.array(z.string().min(1)).min(1),
      difficulty: z.string().min(1).optional(),
      goals: z.record(z.any()).optional(),
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

module.exports = router;

