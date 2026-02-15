import { useEffect, useState } from "react";
import AuthPage from "./components/AuthPage.jsx";
import SuperAppPage from "./components/SuperAppPage.jsx";

const SESSION_KEY = "lifehub_session_v1";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.accessToken) setSession(parsed);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  function handleAuthSuccess(data) {
    const next = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  async function handleRefreshSession() {
    if (!session?.refreshToken) return null;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.accessToken) {
        throw new Error(data.error || "Session expired");
      }
      const next = {
        ...session,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || session.refreshToken
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return next.accessToken;
    } catch {
      handleLogout();
      return null;
    }
  }

  return (
    <div className="app">
      {session?.accessToken ? (
        <SuperAppPage
          session={session}
          onLogout={handleLogout}
          onRefreshSession={handleRefreshSession}
        />
      ) : (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
