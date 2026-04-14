import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api";

function badgeClass(priority) {
  if (priority === "high") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (priority === "medium") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function SortableTaskRow({ task, onEdit, onDelete, onStatusChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-4 ${
        isDragging ? "opacity-70 ring-2 ring-indigo-500/60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              {...attributes}
              className="cursor-grab active:cursor-grabbing select-none inline-flex items-center justify-center"
              title="Drag to reorder"
            >
              <button
                type="button"
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                {...listeners}
              >
                ::
              </button>
            </div>
            <h4 className="font-semibold truncate">{task.title}</h4>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${badgeClass(task.priority)}`}>
              {task.priority}
            </span>
            {task.status === "done" && (
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                done
              </span>
            )}
          </div>

          {task.subject && <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">Subject: {task.subject}</div>}
          {task.description && (
            <p className="text-sm text-slate-700 dark:text-slate-200 mt-2 overflow-hidden text-ellipsis" title={task.description}>
              {task.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value)}
            className="text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-2 py-1 outline-none"
            title="Status"
          >
            <option value="todo">todo</option>
            <option value="in_progress">in_progress</option>
            <option value="done">done</option>
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-sm rounded-xl px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="text-sm rounded-xl px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formMode, setFormMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");

  async function loadTasks() {
    try {
      const data = await apiGet("/tasks");
      setTasks(data.tasks || []);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setTitle("");
    setDescription("");
    setSubject("");
    setPriority("medium");
    setStatus("todo");
  }

  useEffect(() => {
    // no-op placeholder for future socket-based realtime updates
  }, []);

  async function onAddOrUpdate(e) {
    e.preventDefault();
    const payload = {
      title,
      description: description || null,
      subject: subject || null,
      priority,
      status,
    };

    try {
      if (formMode === "edit" && editingId) {
        await apiPut(`/tasks/${editingId}`, payload);
        toast.success("Task updated");
      } else {
        await apiPost("/tasks", payload);
        toast.success("Task created");
      }
      resetForm();
      await loadTasks();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save task");
    }
  }

  async function onDelete(id) {
    if (!confirm("Delete this task?")) return;
    try {
      await apiDelete(`/tasks/${id}`);
      toast.success("Task deleted");
      await loadTasks();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Delete failed");
    }
  }

  async function onStatusChange(id, nextStatus) {
    try {
      await apiPut(`/tasks/${id}`, { status: nextStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)),
      );
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update status");
    }
  }

  function onEdit(task) {
    setFormMode("edit");
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description || "");
    setSubject(task.subject || "");
    setPriority(task.priority || "medium");
    setStatus(task.status || "todo");
  }

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(tasks, oldIndex, newIndex);
    setTasks(next);

    try {
      await apiPatch("/tasks/reorder", { taskIds: next.map((t) => t.id) });
    } catch (err) {
      toast.error(err?.response?.data?.error || "Reorder failed");
      await loadTasks();
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Task Manager</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Add, edit, delete, and reorder tasks with drag-and-drop.</p>
      </div>

      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/30 backdrop-blur p-5">
        <h3 className="font-semibold mb-3">{formMode === "edit" ? "Edit Task" : "Add Task"}</h3>
        <form onSubmit={onAddOrUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Title</span>
            <input
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/60"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Subject (optional)</span>
            <input
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. React, Data Structures"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-medium">Description (optional)</span>
            <textarea
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none min-h-[90px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does 'done' look like?"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-3 py-2 outline-none"
            >
              <option value="todo">todo</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
            </select>
          </label>

          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="flex-1 rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition">
              {formMode === "edit" ? "Save Changes" : "Add Task"}
            </button>
            {formMode === "edit" && (
              <button type="button" onClick={resetForm} className="rounded-xl px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold transition">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {loading ? (
        <div className="text-slate-600 dark:text-slate-300">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-slate-600 dark:text-slate-300">No tasks yet. Add one above.</div>
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {tasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

