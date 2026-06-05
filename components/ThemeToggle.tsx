"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const el = document.documentElement;
    const next = !el.classList.contains("light");
    el.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
    setLight(next);
  }

  return (
    <button
      onClick={toggle}
      title={light ? "Тёмная тема" : "Светлая тема"}
      className="px-3 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
