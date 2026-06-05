"use client";

import { useEffect, useState } from "react";

export type ChartTheme = {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

const DARK: ChartTheme = {
  grid: "#263150",
  axis: "#9aa7c2",
  tooltipBg: "#131a2e",
  tooltipBorder: "#263150",
  tooltipText: "#e8edf7",
};

const LIGHT: ChartTheme = {
  grid: "#dce3ef",
  axis: "#5b6b88",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dce3ef",
  tooltipText: "#0f1729",
};

// Отслеживает класс .light на <html> и возвращает палитру для графиков
export function useChartTheme(): ChartTheme {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setLight(el.classList.contains("light"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return light ? LIGHT : DARK;
}
