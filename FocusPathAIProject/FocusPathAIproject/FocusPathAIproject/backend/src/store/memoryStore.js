const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DB_FILE = path.resolve(__dirname, "../../.demo-db.json");

const db = {
  users: [],
  tasks: [],
  studyPlans: [],
  analyticsByUserDate: new Map(),
  aiLogs: [],
  habits: [],
  habitLogs: [],
  notes: [],
};

function hydrateFromDisk() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    if (!raw) return;
    const loaded = JSON.parse(raw);

    db.users = Array.isArray(loaded.users) ? loaded.users : [];
    db.tasks = Array.isArray(loaded.tasks) ? loaded.tasks : [];
    db.studyPlans = Array.isArray(loaded.studyPlans) ? loaded.studyPlans : [];
    db.aiLogs = Array.isArray(loaded.aiLogs) ? loaded.aiLogs : [];
    db.habits = Array.isArray(loaded.habits) ? loaded.habits : [];
    db.habitLogs = Array.isArray(loaded.habitLogs) ? loaded.habitLogs : [];
    db.notes = Array.isArray(loaded.notes) ? loaded.notes : [];

    const analyticsEntries = Array.isArray(loaded.analyticsByUserDate) ? loaded.analyticsByUserDate : [];
    db.analyticsByUserDate = new Map(analyticsEntries);
  } catch (err) {
    console.error("Demo DB hydrate failed:", DB_FILE, err?.message || err);
  }
}

function persistToDisk() {
  persistCallCount += 1;
  if (persistCallCount === 1) {
    console.log("Demo DB persist called ->", DB_FILE);
  }
  try {
    const payload = {
      users: db.users,
      tasks: db.tasks,
      studyPlans: db.studyPlans,
      analyticsByUserDate: Array.from(db.analyticsByUserDate.entries()),
      aiLogs: db.aiLogs,
      habits: db.habits,
      habitLogs: db.habitLogs,
      notes: db.notes,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("Demo DB persist failed:", DB_FILE, err?.message || err);
  }
}

hydrateFromDisk();
let persistCallCount = 0;

function id() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserById(userId) {
  return db.users.find((u) => u.id === userId) || null;
}

function getUserByEmail(email) {
  return db.users.find((u) => u.email === email) || null;
}

function createUser({ email, passwordHash, displayName }) {
  const user = {
    id: id(),
    email,
    passwordHash,
    displayName: displayName || null,
    preferences: {
      theme: "dark",
      goals: { studyTimePerDayMinutes: 60, focusSubjects: [] },
      careerObjectives: {},
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.users.push(user);
  persistToDisk();
  return user;
}

function updateUser(userId, patch) {
  const u = getUserById(userId);
  if (!u) return null;
  if (patch.displayName !== undefined) u.displayName = patch.displayName;
  if (patch.preferences !== undefined) u.preferences = patch.preferences;
  u.updatedAt = nowIso();
  persistToDisk();
  return u;
}

function listTasks(userId) {
  return db.tasks
    .filter((t) => t.userId === userId)
    .sort((a, b) => a.orderIndex - b.orderIndex || new Date(a.createdAt) - new Date(b.createdAt));
}

function createTask(userId, data) {
  const tasks = listTasks(userId);
  const task = {
    id: id(),
    userId,
    title: data.title,
    description: data.description || null,
    subject: data.subject || null,
    priority: data.priority || "medium",
    status: data.status || "todo",
    deadline: data.deadline || null,
    orderIndex: tasks.length,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.tasks.push(task);
  persistToDisk();
  return task;
}

function getTask(taskId) {
  return db.tasks.find((t) => t.id === taskId) || null;
}

function updateTask(taskId, patch) {
  const t = getTask(taskId);
  if (!t) return null;
  Object.assign(t, patch);
  t.updatedAt = nowIso();
  persistToDisk();
  return t;
}

function deleteTask(taskId) {
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return false;
  db.tasks.splice(idx, 1);
  persistToDisk();
  return true;
}

function reorderTasks(userId, taskIds) {
  taskIds.forEach((taskId, i) => {
    const t = getTask(taskId);
    if (t && t.userId === userId) {
      t.orderIndex = i;
      t.updatedAt = nowIso();
    }
  });
  persistToDisk();
}

function analyticsKey(userId, dateKey) {
  return `${userId}::${dateKey}`;
}

function ensureAnalytics(userId, dateKey = todayKey()) {
  const key = analyticsKey(userId, dateKey);
  if (!db.analyticsByUserDate.has(key)) {
    db.analyticsByUserDate.set(key, {
      id: id(),
      userId,
      date: `${dateKey}T00:00:00.000Z`,
      points: 0,
      streakCount: 1,
      pomodoroSessions: 0,
      tasksCompleted: 0,
      weakSubjects: [],
      strongSubjects: [],
      achievements: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    persistToDisk();
  }
  return db.analyticsByUserDate.get(key);
}

function bumpPomodoro(userId) {
  const a = ensureAnalytics(userId);
  a.points += 10;
  a.pomodoroSessions += 1;
  a.updatedAt = nowIso();
  persistToDisk();
  return a;
}

function bumpTaskCompleted(userId) {
  const a = ensureAnalytics(userId);
  a.points += 5;
  a.tasksCompleted += 1;
  a.updatedAt = nowIso();
  persistToDisk();
  return a;
}

function analyticsSummary(userId) {
  const labels = [];
  const points = [];
  const streak = [];
  const pomodoros = [];
  const tasksCompleted = [];

  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const keyDate = d.toISOString().slice(0, 10);
    labels.push(keyDate);
    const row = db.analyticsByUserDate.get(analyticsKey(userId, keyDate));
    points.push(row?.points || 0);
    streak.push(row?.streakCount || 0);
    pomodoros.push(row?.pomodoroSessions || 0);
    tasksCompleted.push(row?.tasksCompleted || 0);
  }

  const latest = ensureAnalytics(userId);
  return {
    labels,
    points,
    streak,
    pomodoros,
    tasksCompleted,
    latestAnalytics: latest,
  };
}

function createStudyPlan(userId, title, planJson) {
  const plan = {
    id: id(),
    userId,
    title,
    planJson,
    createdAt: nowIso(),
  };
  db.studyPlans.push(plan);
  persistToDisk();
  return plan;
}

function listStudyPlans(userId) {
  return db.studyPlans
    .filter((p) => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addAiLog(userId, type, prompt, response) {
  db.aiLogs.push({ id: id(), userId, type, prompt, response, createdAt: nowIso() });
  persistToDisk();
}

function listAiLogs(userId, type) {
  return db.aiLogs
    .filter((l) => l.userId === userId && (!type || l.type === type))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---- HABITS ----

function listHabits(userId) {
  return db.habits.filter((h) => h.userId === userId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getHabit(habitId) {
  return db.habits.find((h) => h.id === habitId) || null;
}

function createHabit(userId, data) {
  const habit = {
    id: id(),
    userId,
    name: data.name,
    description: data.description || null,
    color: data.color || null,
    icon: data.icon || null,
    frequency: data.frequency || "daily",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.habits.push(habit);
  persistToDisk();
  return habit;
}

function updateHabit(habitId, patch) {
  const h = getHabit(habitId);
  if (!h) return null;
  if (patch.name !== undefined) h.name = patch.name;
  if (patch.description !== undefined) h.description = patch.description;
  if (patch.color !== undefined) h.color = patch.color;
  if (patch.icon !== undefined) h.icon = patch.icon;
  if (patch.frequency !== undefined) h.frequency = patch.frequency;
  h.updatedAt = nowIso();
  persistToDisk();
  return h;
}

function deleteHabit(habitId) {
  const idx = db.habits.findIndex((h) => h.id === habitId);
  if (idx < 0) return false;
  db.habits.splice(idx, 1);
  db.habitLogs = db.habitLogs.filter((l) => l.habitId !== habitId);
  persistToDisk();
  return true;
}

function getHabitLogs(userId, date) {
  return db.habitLogs.filter((l) => l.userId === userId && l.date === date);
}

function setHabitLog(userId, habitId, date, done) {
  const existing = db.habitLogs.find((l) => l.habitId === habitId && l.date === date);
  if (existing) {
    existing.done = done;
  } else {
    db.habitLogs.push({ id: id(), habitId, userId, date, done, createdAt: nowIso() });
  }
  persistToDisk();
}

function calcHabitStreak(habitId) {
  const doneDates = new Set(
    db.habitLogs.filter((l) => l.habitId === habitId && l.done).map((l) => l.date)
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (doneDates.has(key)) streak++;
    else break;
  }
  return streak;
}

// ---- NOTES ----

function listNotes(userId) {
  return db.notes
    .filter((n) => n.userId === userId)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getNote(noteId) {
  return db.notes.find((n) => n.id === noteId) || null;
}

function createNote(userId, data) {
  const note = {
    id: id(),
    userId,
    title: data.title,
    content: data.content,
    subject: data.subject || null,
    tags: data.tags || [],
    pinned: data.pinned || false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.notes.push(note);
  persistToDisk();
  return note;
}

function updateNote(noteId, patch) {
  const n = getNote(noteId);
  if (!n) return null;
  if (patch.title !== undefined) n.title = patch.title;
  if (patch.content !== undefined) n.content = patch.content;
  if (patch.subject !== undefined) n.subject = patch.subject;
  if (patch.tags !== undefined) n.tags = patch.tags;
  if (patch.pinned !== undefined) n.pinned = patch.pinned;
  n.updatedAt = nowIso();
  persistToDisk();
  return n;
}

function deleteNote(noteId) {
  const idx = db.notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return false;
  db.notes.splice(idx, 1);
  persistToDisk();
  return true;
}

module.exports = {
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  listTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  reorderTasks,
  bumpPomodoro,
  bumpTaskCompleted,
  analyticsSummary,
  createStudyPlan,
  listStudyPlans,
  addAiLog,
  listAiLogs,
  listHabits,
  getHabit,
  createHabit,
  updateHabit,
  deleteHabit,
  getHabitLogs,
  setHabitLog,
  calcHabitStreak,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
};
