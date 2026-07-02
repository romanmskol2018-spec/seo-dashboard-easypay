// Сквозная карта проектов EasyPay: имя проекта в лидах Bitrix ↔ сайт
// (домен, Метрика) ↔ проект Топвизора. Используется глобальным фильтром
// проектов: лиды/продажи фильтруются по имени, SEO-секции — по маппингу.
// Без "use server"/"use client" — импортируется и там, и там.

// До этой даты Bitrix/CRM был не настроен толком (тестовые/мусорные лиды,
// нерепрезентативные UTM) — дашборд, импортёры и атрибуция игнорируют
// всё, что раньше. Дата — начало продаж карт по реестру.
export const DASHBOARD_START = "2026-05-01";

export const LEAD_PROJECTS = [
  "Easypay.World",
  "4YouCards",
  "VisaMasterCards",
  "AVO.cards",
  "Visatut",
] as const;
export type LeadProject = (typeof LEAD_PROJECTS)[number];

// domain — сайт в дашборде (трафик Метрики), topvisor — имя проекта Топвизора.
// null = у проекта нет своего сайта/проекта в дашборде (AVO.cards — соцсети).
export const PROJECT_MAP: Record<
  LeadProject,
  { domain: string | null; topvisor: string | null }
> = {
  "Easypay.World": { domain: "easypay.world", topvisor: "Easypay" },
  "4YouCards": { domain: "4you.cards", topvisor: "4you.cards" },
  VisaMasterCards: { domain: "visamaster.cards", topvisor: "visamaster.cards" },
  "AVO.cards": { domain: null, topvisor: null },
  Visatut: { domain: "visatut.pro", topvisor: "visatut.pro" },
};
