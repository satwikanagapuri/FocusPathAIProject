const express = require("express");

const { requireAuth } = require("../middleware/auth");
const { bumpPomodoroComplete, getAnalyticsSummary } = require("../services/analytics.service");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

function emitDashboardRefresh(req, userId) {
  const io = req.app.get("io");
  io?.to(userId).emit("dashboard:refresh", { reason: "analytics_changed" });
}

router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const summary = DEMO_MODE
      ? mem.analyticsSummary(req.user.id)
      : await getAnalyticsSummary({ userId: req.user.id });
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

router.post("/pomodoro/complete", requireAuth, async (req, res, next) => {
  try {
    // payload reserved for future expansion
    if (DEMO_MODE) mem.bumpPomodoro(req.user.id);
    else await bumpPomodoroComplete({ userId: req.user.id });
    emitDashboardRefresh(req, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

