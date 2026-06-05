"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-xl"
      >
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold">SEO Дашборд EasyPay</div>
          <p className="text-muted text-sm mt-1">Вход в админ-панель</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-negative bg-negative/10 border border-negative/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <label className="block text-sm text-muted mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full mb-4 bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent transition"
          placeholder="admin@example.com"
        />

        <label className="block text-sm text-muted mb-1">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full mb-6 bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent transition"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 transition"
        >
          {loading ? "Вход…" : "Войти"}
        </button>

        <a
          href="/"
          className="block text-center text-sm text-muted hover:text-foreground mt-4 transition"
        >
          ← Вернуться к дашборду
        </a>
      </form>
    </main>
  );
}
