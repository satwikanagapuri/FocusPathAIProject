import React, { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import Nav from "../components/Nav";

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", subject: "", tags: "", pinned: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (subjectFilter) params.subject = subjectFilter;
      if (search) params.search = search;
      const { notes: data } = await apiGet("/notes", params);
      setNotes(data || []);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  function openNew() {
    setForm({ title: "", content: "", subject: "", tags: "", pinned: false });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(note) {
    setForm({
      title: note.title,
      content: note.content,
      subject: note.subject || "",
      tags: Array.isArray(note.tags) ? note.tags.join(", ") : "",
      pinned: note.pinned || false,
    });
    setEditing(note);
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content,
        subject: form.subject.trim() || null,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        pinned: form.pinned,
      };

      if (editing) {
        const { note } = await apiPut(`/notes/${editing.id}`, payload);
        setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
        toast.success("Note updated");
      } else {
        const { note } = await apiPost("/notes", payload);
        setNotes((prev) => [note, ...prev]);
        toast.success("Note saved!");
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id) {
    if (!window.confirm("Delete this note?")) return;
    try {
      await apiDelete(`/notes/${id}`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
    }
  }

  async function togglePin(note) {
    try {
      const { note: updated } = await apiPut(`/notes/${note.id}`, { pinned: !note.pinned });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch {
      toast.error("Failed to pin note");
    }
  }

  const allSubjects = [...new Set(notes.map((n) => n.subject).filter(Boolean))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 dark:from-slate-950 dark:via-violet-950/20 dark:to-indigo-950/20">
      <Nav />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
              Notes
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Capture ideas, summaries, and study notes.</p>
          </div>
          <button
            onClick={openNew}
            className="rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90"
          >
            + New Note
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm outline-none"
          />
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm outline-none"
          >
            <option value="">All subjects</option>
            {allSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-8">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
            <div className="text-4xl mb-3">📝</div>
            <div className="font-semibold">No notes yet</div>
            <div className="text-sm mt-1">Start capturing your thoughts and study summaries</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`rounded-2xl border p-4 shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow ${
                  note.pinned
                    ? "border-violet-300/80 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-950/20"
                    : "border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/40"
                }`}
                onClick={() => openEdit(note)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {note.pinned && <span className="text-violet-500">📌</span>}
                    <h3 className="font-semibold truncate">{note.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => togglePin(note)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm" title={note.pinned ? "Unpin" : "Pin"}>
                      {note.pinned ? "📌" : "📍"}
                    </button>
                    <button onClick={() => deleteNote(note.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm">
                      🗑️
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{note.content}</p>

                <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
                  {note.subject && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{note.subject}</span>
                  )}
                  {Array.isArray(note.tags) && note.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">#{tag}</span>
                  ))}
                  <span className="text-xs text-slate-400 ml-auto">{(() => { const d = new Date(note.updatedAt); return isNaN(d) ? "" : d.toLocaleDateString(); })()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold">{editing ? "Edit Note" : "New Note"}</h3>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Note title"
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write your note here..."
                rows={8}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm resize-none font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Subject</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Python, DSA"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Tags (comma separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g. loops, functions"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} className="rounded" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Pin this note</span>
            </label>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-60">
                {saving ? "Saving..." : editing ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
