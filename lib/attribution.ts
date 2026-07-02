// Атрибуция канала по лидам Bitrix — единая точка правды.
// Ключевые слова каналов используются в двух местах: import-bitrix.ts
// (лиды по неделям) и import-cards-registry.ts (канал продажи карты).
// Менять словарь каналов — только здесь, иначе разъедутся цифры
// «лиды по каналам» и «выручка по каналам».
import { listAllFast } from "./bitrix";

export const SRC_KEYS = [
  "seo", "recom", "direct", "klerk", "insta", "karty", "dzen", "youtube", "partner",
] as const;
export type SrcKey = (typeof SRC_KEYS)[number];

// UF-поля лида портала EasyPay, участвующие в определении источника
export const LEAD_SRC_FIELDS = {
  istochnik: "UF_CRM_1779838134", // «Источник»
  sistema: "UF_CRM_1779840045", // «Система» (yandex/google/…)
  referer: "UF_CRM_1779841897", // «Реферер»
  direct: "UF_CRM_1779841908", // метка Я.Директа (непустая = реклама)
} as const;

export type ChannelParts = {
  blob: string; // склейка utmS+utmM+источник+система+реферер, lowercase
  utmS: string; // UTM_SOURCE, lowercase
  utmM: string; // UTM_MEDIUM, lowercase
  src: string; // SOURCE_ID, lowercase
  directAd: boolean; // есть метка Я.Директа
};

export function matchChannel(p: ChannelParts): SrcKey | "unknown" {
  const { blob, utmS, utmM, src, directAd } = p;
  if (blob.includes("klerk")) return "klerk";
  if (blob.includes("dzen") || blob.includes("дзен")) return "dzen";
  if (blob.includes("youtube") || blob.includes("ютуб") || blob.includes("youtu"))
    return "youtube";
  if (utmS.includes("instagram") || utmS === "ig" || blob.includes("instagram") || blob.includes("соц"))
    return "insta";
  if (blob.includes("2gis") || blob.includes("karty") || blob.includes("карты"))
    return "karty";
  if (blob.includes("partner") || blob.includes("партн") || blob.includes("affiliate"))
    return "partner";
  if (utmM.includes("cpc") || blob.includes("ya_direct") || blob.includes("реклама") || directAd)
    return "direct";
  if (
    utmM.includes("organic") ||
    /\b(google|yandex|bing)\b/.test(blob) ||
    blob.includes("seo")
  )
    return "seo";
  if (
    src.includes("repeat_sale") || src.includes("call") || src.includes("connector") ||
    blob.includes("прям") || blob.includes("recommend") || blob.includes("повтор")
  )
    return "recom";
  return "unknown";
}

// Нормализация телефона к 10-значному мобильному (9XXXXXXXXX) или null.
export function normalizeMobile(s: string): string | null {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
  return d.length === 10 && d[0] === "9" ? d : null;
}

// Карта «мобильный → канал ПЕРВОГО лида с этим телефоном» по всем лидам
// портала (first-touch: лиды идут по возрастанию ID = по времени создания).
// Дата лида не фильтруется намеренно: покупатель мая мог оставить первый
// лид задолго до покупки — обрезка по дате роняет покрытие с 95% до ~9%.
export async function fetchPhoneChannelMap(
  onProgress?: (leadsFetched: number) => void
): Promise<Map<string, SrcKey | "unknown">> {
  const F = LEAD_SRC_FIELDS;
  const rows = await listAllFast(
    "crm.lead.list",
    {
      select: [
        "ID", "PHONE", "UTM_SOURCE", "UTM_MEDIUM", "SOURCE_ID",
        F.istochnik, F.sistema, F.referer, F.direct,
      ],
    },
    onProgress
  );
  const map = new Map<string, SrcKey | "unknown">();
  for (const r of rows) {
    const ph = r.PHONE as { VALUE?: string }[] | undefined;
    if (!Array.isArray(ph) || !ph.length) continue;
    const utmS = String(r.UTM_SOURCE || "").toLowerCase();
    const utmM = String(r.UTM_MEDIUM || "").toLowerCase();
    const blob = [
      utmS, utmM,
      String(r[F.istochnik] || ""), String(r[F.sistema] || ""), String(r[F.referer] || ""),
    ]
      .join(" ")
      .toLowerCase();
    const ch = matchChannel({
      blob,
      utmS,
      utmM,
      src: String(r.SOURCE_ID || "").toLowerCase(),
      directAd: !!String(r[F.direct] || "").trim(),
    });
    for (const p of ph) {
      const m = normalizeMobile(String(p.VALUE || ""));
      if (m && !map.has(m)) map.set(m, ch);
    }
  }
  return map;
}
