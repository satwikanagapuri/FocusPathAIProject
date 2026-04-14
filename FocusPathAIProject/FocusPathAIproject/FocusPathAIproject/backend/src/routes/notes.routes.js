const express = require("express");
const { z } = require("zod");

const { prisma } = require("../config/prisma");
const { requireAuth } = require("../middleware/auth");
const mem = require("../store/memoryStore");

const router = express.Router();
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const subject = req.query.subject;
    const search = req.query.search?.toLowerCase();

    if (DEMO_MODE) {
      let notes = mem.listNotes(req.user.id);
      if (subject) notes = notes.filter((n) => n.subject === subject);
      if (search) notes = notes.filter((n) =>
        n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search)
      );
      return res.json({ notes });
    }

    const where = { userId: req.user.id };
    if (subject) where.subject = subject;

    let notes = await prisma.note.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });

    if (search) {
      notes = notes.filter(
        (n) => n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search)
      );
    }

    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(200),
      content: z.string().max(10000),
      subject: z.string().max(80).optional().nullable(),
      tags: z.array(z.string().max(40)).max(10).optional(),
      pinned: z.boolean().optional(),
    });
    const { title, content, subject, tags, pinned } = schema.parse(req.body);

    const note = DEMO_MODE
      ? mem.createNote(req.user.id, { title, content, subject: subject || null, tags: tags || [], pinned: pinned || false })
      : await prisma.note.create({
          data: {
            userId: req.user.id,
            title,
            content,
            subject: subject || null,
            tags: tags || [],
            pinned: pinned || false,
          },
        });

    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(200).optional(),
      content: z.string().max(10000).optional(),
      subject: z.string().max(80).optional().nullable(),
      tags: z.array(z.string().max(40)).max(10).optional(),
      pinned: z.boolean().optional(),
    });
    const { id } = req.params;
    const update = schema.parse(req.body);

    const existing = DEMO_MODE
      ? mem.getNote(id)
      : await prisma.note.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Note not found" });

    const note = DEMO_MODE
      ? mem.updateNote(id, update)
      : await prisma.note.update({ where: { id }, data: update });

    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = DEMO_MODE
      ? mem.getNote(id)
      : await prisma.note.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Note not found" });

    if (DEMO_MODE) mem.deleteNote(id);
    else await prisma.note.delete({ where: { id } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
