const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const { signToken } = require("../lib/jwt");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

router.post("/register", async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      displayName: z.string().min(1).max(80).optional(),
    });

    const { email, password, displayName } = schema.parse(req.body);

    const existing = DEMO_MODE
      ? mem.getUserByEmail(email)
      : await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = DEMO_MODE
      ? mem.createUser({ email, passwordHash, displayName: displayName || null })
      : await prisma.user.create({
          data: {
            email,
            passwordHash,
            displayName: displayName || null,
            preferences: {
              theme: "dark",
              goals: { studyTimePerDayMinutes: 60 },
              careerObjectives: {},
            },
          },
        });

    const token = signToken({ sub: user.id, email: user.email });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const { email, password } = schema.parse(req.body);

    const user = DEMO_MODE
      ? mem.getUserByEmail(email)
      : await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ sub: user.id, email: user.email });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = DEMO_MODE
      ? mem.getUserById(req.user.id)
      : await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { id: true, email: true, displayName: true, preferences: true, createdAt: true },
        });

    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

router.put("/me", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).max(80).optional(),
      preferences: z.record(z.string(), z.unknown()).optional(),
    });

    const { displayName, preferences } = schema.parse(req.body);

    const updated = DEMO_MODE
      ? mem.updateUser(req.user.id, {
          displayName: displayName === undefined ? undefined : displayName,
          preferences: preferences === undefined ? undefined : preferences,
        })
      : await prisma.user.update({
          where: { id: req.user.id },
          data: {
            displayName: displayName === undefined ? undefined : displayName,
            preferences: preferences === undefined ? undefined : preferences,
          },
          select: { id: true, email: true, displayName: true, preferences: true },
        });

    return res.json({ user: updated });
  } catch (err) {
    return next(err);
  }
});

// ---------------- Optional OAuth stubs ----------------
// JWT auth is fully implemented above. OAuth is intentionally optional; these
// endpoints provide a ready-to-wire contract for Google/Facebook providers.
router.get("/oauth/google/start", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ error: "Google OAuth not configured. Add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET." });
  }
  return res.status(501).json({ error: "Google OAuth flow not implemented in this starter. Wire using passport-google-oauth20." });
});

router.get("/oauth/google/callback", async (req, res) => {
  return res.status(501).json({ error: "Google OAuth callback not implemented." });
});

router.get("/oauth/facebook/start", async (req, res) => {
  if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
    return res.status(501).json({ error: "Facebook OAuth not configured. Add FACEBOOK_CLIENT_ID/FACEBOOK_CLIENT_SECRET." });
  }
  return res.status(501).json({ error: "Facebook OAuth flow not implemented in this starter." });
});

module.exports = router;

