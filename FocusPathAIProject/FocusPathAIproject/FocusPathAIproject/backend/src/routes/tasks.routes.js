const express = require("express");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { bumpTaskCompletion } = require("../services/analytics.service");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

function emitDashboardRefresh(req, userId) {
  const io = req.app.get("io");
  io?.to(userId).emit("dashboard:refresh", { reason: "tasks_changed" });
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const tasks = DEMO_MODE
      ? mem.listTasks(req.user.id)
      : await prisma.task.findMany({
          where: { userId: req.user.id },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        });
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(500).optional().nullable(),
      subject: z.string().max(80).optional().nullable(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      deadline: z.string().datetime().optional().nullable(),
    });

    const { title, description, subject, priority, status, deadline } = schema.parse(req.body);

    const task = DEMO_MODE
      ? mem.createTask(req.user.id, {
          title,
          description: description || null,
          subject: subject || null,
          priority: priority || "medium",
          status: status || "todo",
          deadline: deadline || null,
        })
      : await prisma.task.create({
          data: {
            userId: req.user.id,
            title,
            description: description || null,
            subject: subject || null,
            priority: priority || "medium",
            status: status || "todo",
            deadline: deadline ? new Date(deadline) : null,
            orderIndex: 0,
          },
        });

    emitDashboardRefresh(req, req.user.id);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120).optional(),
      description: z.string().max(500).optional().nullable(),
      subject: z.string().max(80).optional().nullable(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      deadline: z.string().datetime().optional().nullable(),
      orderIndex: z.number().int().optional(),
    });

    const { id } = req.params;
    const update = schema.parse(req.body);

    const existing = DEMO_MODE
      ? mem.getTask(id)
      : await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Task not found" });

    const nextStatus = update.status ?? existing.status;
    const becameDone = existing.status !== "done" && nextStatus === "done";

    const task = DEMO_MODE
      ? mem.updateTask(id, {
          title: update.title ?? existing.title,
          description: update.description === undefined ? existing.description : update.description,
          subject: update.subject === undefined ? existing.subject : update.subject,
          priority: update.priority ?? existing.priority,
          status: nextStatus,
          deadline: update.deadline === undefined ? existing.deadline : update.deadline,
          orderIndex: update.orderIndex ?? existing.orderIndex,
        })
      : await prisma.task.update({
          where: { id },
          data: {
            title: update.title ?? existing.title,
            description: update.description === undefined ? existing.description : update.description,
            subject: update.subject === undefined ? existing.subject : update.subject,
            priority: update.priority ?? existing.priority,
            status: nextStatus,
            deadline: update.deadline === undefined ? existing.deadline : update.deadline ? new Date(update.deadline) : null,
            orderIndex: update.orderIndex ?? existing.orderIndex,
          },
        });

    if (becameDone) {
      if (DEMO_MODE) mem.bumpTaskCompleted(req.user.id);
      else await bumpTaskCompletion({ userId: req.user.id, subject: task.subject });
    }

    emitDashboardRefresh(req, req.user.id);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = DEMO_MODE
      ? mem.getTask(id)
      : await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Task not found" });

    if (DEMO_MODE) mem.deleteTask(id);
    else await prisma.task.delete({ where: { id } });
    emitDashboardRefresh(req, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/reorder", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      taskIds: z.array(z.string().min(1)).min(1),
    });
    const { taskIds } = schema.parse(req.body);

    if (DEMO_MODE) {
      mem.reorderTasks(req.user.id, taskIds);
    } else {
      const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds }, userId: req.user.id },
      });
      const byId = new Map(tasks.map((t) => [t.id, t]));
      for (let i = 0; i < taskIds.length; i++) {
        const t = byId.get(taskIds[i]);
        if (!t) continue;
        await prisma.task.update({
          where: { id: t.id },
          data: { orderIndex: i },
        });
      }
    }

    emitDashboardRefresh(req, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

