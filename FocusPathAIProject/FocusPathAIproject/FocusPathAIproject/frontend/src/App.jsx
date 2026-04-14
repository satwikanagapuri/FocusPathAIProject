import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import { useAuthStore } from "./store/useAuthStore";
import "react-toastify/dist/ReactToastify.css";

import AuthPage from "./pages/AuthPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import PomodoroPage from "./pages/PomodoroPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import CareerPage from "./pages/CareerPage.jsx";
import HabitsPage from "./pages/HabitsPage.jsx";
import NotesPage from "./pages/NotesPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import FlashcardsPage from "./pages/FlashcardsPage.jsx";

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return children;
}

function Protected({ children }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  const theme = useAuthStore((s) => s.theme);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return (
    <>
      <ToastContainer position="top-right" autoClose={3500} hideProgressBar newestOnTop />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/login" element={<Navigate to="/auth?mode=login" replace />} />
        <Route path="/signup" element={<Navigate to="/auth?mode=register" replace />} />

        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/tasks" element={<Protected><TasksPage /></Protected>} />
        <Route path="/pomodoro" element={<Protected><PomodoroPage /></Protected>} />
        <Route path="/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/analytics" element={<Protected><AnalyticsPage /></Protected>} />
        <Route path="/career" element={<Protected><CareerPage /></Protected>} />
        <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="/habits" element={<Protected><HabitsPage /></Protected>} />
        <Route path="/notes" element={<Protected><NotesPage /></Protected>} />
        <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
        <Route path="/flashcards" element={<Protected><FlashcardsPage /></Protected>} />

        <Route path="/" element={<Navigate to={token ? "/dashboard" : "/auth"} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
