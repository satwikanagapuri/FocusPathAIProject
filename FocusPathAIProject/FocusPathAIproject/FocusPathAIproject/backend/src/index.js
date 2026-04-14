const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const env = require("./config/env");
const { setupSocket } = require("./socket");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const tasksRoutes = require("./routes/tasks.routes");
const studyPlansRoutes = require("./routes/studyPlans.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const aiRoutes = require("./routes/ai.routes");
const habitsRoutes = require("./routes/habits.routes");
const notesRoutes = require("./routes/notes.routes");

const app = express();

const allowedOrigins = Array.from(
  new Set([
    env.FRONTEND_ORIGIN,
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ])
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin && (origin.endsWith(".replit.dev") || origin.endsWith(".repl.co"))) return callback(null, true);
    if (origin && origin.endsWith(".github.io")) return callback(null, true);
    if (origin && origin.endsWith(".onrender.com")) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

app.use(express.json({ limit: "1mb" }));
app.use(cors(corsOptions));
app.use(helmet());
app.use(morgan(env.LOG_LEVEL === "debug" ? "dev" : "tiny"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/study-plans", studyPlansRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/habits", habitsRoutes);
app.use("/api/notes", notesRoutes);

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.set("io", io);
setupSocket(io);

const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");
if (require("fs").existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get("/{*splat}", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return res.status(404).json({ error: "Not Found" });
    }
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: "Not Found" }));
}

app.use(errorHandler);

/* ✅ FIXED PORT ISSUE HERE */
const PORT = process.env.PORT || env.BACKEND_PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`FocusPath AI backend listening on :${PORT}`);
});