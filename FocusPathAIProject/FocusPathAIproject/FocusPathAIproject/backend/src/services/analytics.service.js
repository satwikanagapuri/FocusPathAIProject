const { prisma } = require("../config/prisma");

function todayUtcMidnight() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function ensureAnalyticsRow({ userId, date }) {
  const existing = await prisma.analytics.findUnique({ where: { userId_date: { userId, date } } });
  if (existing) return existing;

  return prisma.analytics.create({
    data: {
      userId,
      date,
      points: 0,
      streakCount: 0,
      pomodoroSessions: 0,
      tasksCompleted: 0,
      weakSubjects: null,
      strongSubjects: null,
      achievements: null,
    },
  });
}

async function computeWeakStrongSubjects({ userId }) {
  const tasks = await prisma.task.findMany({
    where: { userId },
    select: { subject: true, status: true },
  });

  const bySubject = new Map();
  for (const t of tasks) {
    if (!t.subject) continue;
    const entry = bySubject.get(t.subject) || { subject: t.subject, todo: 0, done: 0 };
    if (t.status === "done") entry.done += 1;
    else entry.todo += 1;
    bySubject.set(t.subject, entry);
  }

  const arr = Array.from(bySubject.values());
  arr.sort((a, b) => (b.done - b.todo) - (a.done - a.todo));

  const strong = arr.slice(0, 5).map((x) => x.subject);
  const weak = arr
    .slice()
    .sort((a, b) => (a.todo - a.done) - (b.todo - b.done))
    .slice(0, 5)
    .map((x) => x.subject);

  return { weakSubjects: weak, strongSubjects: strong };
}

async function bumpPomodoroComplete({ userId }) {
  const date = todayUtcMidnight();
  const y = addDaysUTC(date, -1);

  const prev = await prisma.analytics.findUnique({ where: { userId_date: { userId, date: y } } });
  const todayExisting = await prisma.analytics.findUnique({ where: { userId_date: { userId, date } } });

  const todayIsFirstWrite = !todayExisting;
  const streakCount = todayIsFirstWrite
    ? prev && (prev.points > 0 || prev.pomodoroSessions > 0 || prev.tasksCompleted > 0)
      ? 1 + (prev.streakCount || 0)
      : 1
    : todayExisting.streakCount || 1;

  const pointsToAdd = 10;

  const updated = await prisma.analytics.upsert({
    where: { userId_date: { userId, date } },
    update: {
      points: { increment: pointsToAdd },
      pomodoroSessions: { increment: 1 },
      streakCount,
    },
    create: {
      userId,
      date,
      points: pointsToAdd,
      streakCount,
      pomodoroSessions: 1,
      tasksCompleted: 0,
      weakSubjects: null,
      strongSubjects: null,
      achievements: null,
    },
  });

  const { weakSubjects, strongSubjects } = await computeWeakStrongSubjects({ userId });
  await prisma.analytics.update({
    where: { id: updated.id },
    data: { weakSubjects, strongSubjects },
  });

  return updated;
}

async function bumpTaskCompletion({ userId, subject }) {
  const date = todayUtcMidnight();

  const updated = await prisma.analytics.upsert({
    where: { userId_date: { userId, date } },
    update: {
      points: { increment: 5 },
      tasksCompleted: { increment: 1 },
    },
    create: {
      userId,
      date,
      points: 5,
      streakCount: 1,
      pomodoroSessions: 0,
      tasksCompleted: 1,
      weakSubjects: null,
      strongSubjects: null,
      achievements: null,
    },
  });

  const { weakSubjects, strongSubjects } = await computeWeakStrongSubjects({ userId });
  await prisma.analytics.update({
    where: { id: updated.id },
    data: { weakSubjects, strongSubjects },
  });

  return updated;
}

async function getAnalyticsSummary({ userId }) {
  // Next 7 days-ish range; compute last 14 for charts.
  const now = new Date();
  const days = 14;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1), 0, 0, 0, 0));

  const rows = await prisma.analytics.findMany({
    where: { userId, date: { gte: start } },
    orderBy: { date: "asc" },
  });

  const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  const labels = [];
  const points = [];
  const streak = [];
  const pomodoros = [];
  const tasksCompleted = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key);
    const r = byDate.get(key);
    points.push(r ? r.points : 0);
    streak.push(r ? r.streakCount : 0);
    pomodoros.push(r ? r.pomodoroSessions : 0);
    tasksCompleted.push(r ? r.tasksCompleted : 0);
  }

  // Current weak/strong from most recent row.
  const latest = rows[rows.length - 1] || null;

  return {
    labels,
    points,
    streak,
    pomodoros,
    tasksCompleted,
    latestAnalytics: latest
      ? {
          date: latest.date,
          points: latest.points,
          streakCount: latest.streakCount,
          pomodoroSessions: latest.pomodoroSessions,
          tasksCompleted: latest.tasksCompleted,
          weakSubjects: latest.weakSubjects,
          strongSubjects: latest.strongSubjects,
        }
      : null,
  };
}

module.exports = {
  bumpPomodoroComplete,
  bumpTaskCompletion,
  getAnalyticsSummary,
};

