const express = require("express");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const date = req.query.date || todayKey();
    if (DEMO_MODE) {
      const habits = mem.listHabits(req.user.id);
      const logs = mem.getHabitLogs(req.user.id, date);
      const logsMap = new Map(logs.map((l) => [l.habitId, l]));
      return res.json({
        habits: habits.map((h) => ({ ...h, done: logsMap.get(h.id)?.done || false })),
      });
    }

    const habits = await prisma.habit.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
      include: {
        logs: { where: { date } },
      },
    });

    res.json({
      habits: habits.map((h) => ({
        ...h,
        logs: undefined,
        done: h.logs[0]?.done || false,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(300).optional().nullable(),
      color: z.string().max(30).optional().nullable(),
      icon: z.string().max(10).optional().nullable(),
      frequency: z.enum(["daily", "weekdays", "weekends"]).optional(),
    });
    const { name, description, color, icon, frequency } = schema.parse(req.body);

    const habit = DEMO_MODE
      ? mem.createHabit(req.user.id, { name, description, color, icon, frequency: frequency || "daily" })
      : await prisma.habit.create({
          data: {
            userId: req.user.id,
            name,
            description: description || null,
            color: color || null,
            icon: icon || null,
            frequency: frequency || "daily",
          },
        });

    res.json({ habit: { ...habit, done: false } });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(300).optional().nullable(),
      color: z.string().max(30).optional().nullable(),
      icon: z.string().max(10).optional().nullable(),
      frequency: z.enum(["daily", "weekdays", "weekends"]).optional(),
    });
    const { id } = req.params;
    const update = schema.parse(req.body);

    const existing = DEMO_MODE
      ? mem.getHabit(id)
      : await prisma.habit.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Habit not found" });

    const habit = DEMO_MODE
      ? mem.updateHabit(id, update)
      : await prisma.habit.update({ where: { id }, data: update });

    res.json({ habit: { ...habit, done: false } });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = DEMO_MODE
      ? mem.getHabit(id)
      : await prisma.habit.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Habit not found" });

    if (DEMO_MODE) mem.deleteHabit(id);
    else await prisma.habit.delete({ where: { id } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/toggle", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      date: z.string().optional(),
      done: z.boolean(),
    });
    const { id } = req.params;
    const { date = todayKey(), done } = schema.parse(req.body);

    const existing = DEMO_MODE
      ? mem.getHabit(id)
      : await prisma.habit.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Habit not found" });

    if (DEMO_MODE) {
      mem.setHabitLog(req.user.id, id, date, done);
    } else {
      await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: id, date } },
        update: { done },
        create: { habitId: id, userId: req.user.id, date, done },
      });
    }

    res.json({ ok: true, done });
  } catch (err) {
    next(err);
  }
});

router.get("/streaks", requireAuth, async (req, res, next) => {
  try {
    if (DEMO_MODE) {
      const habits = mem.listHabits(req.user.id);
      const streaks = habits.map((h) => ({ habitId: h.id, streak: mem.calcHabitStreak(h.id) }));
      return res.json({ streaks });
    }

    const habits = await prisma.habit.findMany({
      where: { userId: req.user.id },
      include: {
        logs: { where: { done: true }, orderBy: { date: "desc" }, take: 60 },
      },
    });

    const streaks = habits.map((h) => {
      const dates = new Set(h.logs.map((l) => l.date));
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (dates.has(key)) streak++;
        else break;
      }
      return { habitId: h.id, streak };
    });

    res.json({ streaks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
