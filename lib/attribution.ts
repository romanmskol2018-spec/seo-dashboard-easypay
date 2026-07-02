// Атрибуция канала по лидам Bitrix — единая точка правды.
// Ключевые слова каналов используются в двух местах: import-bitrix.ts
// (лиды по неделям) и import-cards-registry.ts (канал продажи карты).
// Менять словарь каналов — только здесь, иначе разъедутся цифры
// «лиды по каналам» и «выручка по каналам».
import { listAllFast, enumMap } from "./bitrix";
import { LEAD_PROJECTS, DASHBOARD_START } from "./projects";

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

// «Проект» лида и сделки (enum) — те же, что в import-bitrix.ts
export const LEAD_PROJECT_FIELD = "UF_CRM_1738064110267";
export const DEAL_PROJECT_FIELD = "UF_CRM_1738065172726";

// Проект продажи: только реальные имена проектов, без дефолта — для карты
// честнее пустой проект, чем приписанный Easypay.World (как у лидов).
function normSaleProject(
  raw: string,
  map: Record<string, string>
): string | null {
  const v = map[raw] || raw || "";
  if (!v) return null;
  if (v.includes("гражданств")) return "Easypay.World";
  return (LEAD_PROJECTS as readonly string[]).includes(v) ? v : null;
}

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

// Каналы продажи — детальнее лидовых: recom-бакет у продаж разбивается по
// SOURCE_ID на мессенджеры (открытые линии/виджет) и звонки. Для ЛИДОВ так
// делать нельзя без миграции: у LeadStat фиксированные колонки каналов.
export type SaleChannel = SrcKey | "messenger" | "call" | "unknown";

export function matchSaleChannel(p: ChannelParts): SaleChannel {
  const ch = matchChannel(p);
  if (ch !== "recom") return ch;
  if (p.src.includes("connector")) return "messenger"; // откр. линия/виджет/бот
  if (p.src.includes("call")) return "call";
  return "recom"; // «прямые», повторные обращения
}

// Нормализация телефона к 10-значному мобильному (9XXXXXXXXX) или null.
export function normalizeMobile(s: string): string | null {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
  return d.length === 10 && d[0] === "9" ? d : null;
}

// Явно размеченные каналы привлечения (в отличие от messenger/call/recom,
// которые говорят лишь «как клиент постучался», а не «откуда узнал»).
const MARKED: ReadonlySet<string> = new Set<string>(
  SRC_KEYS.filter((k) => k !== "recom")
);

export type PhoneAttribution = {
  channel: SaleChannel;
  project: string | null; // проект лида (Easypay.World/4YouCards/…)
};

// Карта «мобильный → канал + проект лида» по всем лидам портала.
// Канал: первый ЯВНО РАЗМЕЧЕННЫЙ лид (seo/direct/klerk/…), а если таких
// нет — первый лид вообще (мессенджер/звонок/прямые). Лиды идут по
// возрастанию ID = по времени, так что «первый» = самый ранний (first-touch).
// Проект: от того же лида, что и канал; если пуст — первый лид телефона
// с заполненным проектом; если и там пусто — проект СДЕЛКИ, связанной с
// любым лидом телефона (у сделок «Проект» заполняется чаще, чем у лидов).
// Лиды до DASHBOARD_START сознательно игнорируются — до этой даты Bitrix
// не был толком настроен (мусорные/тестовые лиды, кривые UTM). Из 62 502
// лидов истории только ~7 000 (11%) — с этой даты; покрытие атрибуции
// падает с ~97% до ~84%, но это честнее: остальное — не пригодные данные.
export async function fetchPhoneChannelMap(
  onProgress?: (leadsFetched: number) => void
): Promise<Map<string, PhoneAttribution>> {
  const F = LEAD_SRC_FIELDS;
  const projEnum = await enumMap("lead", LEAD_PROJECT_FIELD);
  const rows = await listAllFast(
    "crm.lead.list",
    {
      select: [
        "ID", "PHONE", "UTM_SOURCE", "UTM_MEDIUM", "SOURCE_ID",
        F.istochnik, F.sistema, F.referer, F.direct, LEAD_PROJECT_FIELD,
      ],
      filter: { "[>=DATE_CREATE]": `${DASHBOARD_START}T00:00:00` },
    },
    onProgress
  );
  type Hit = { ch: SaleChannel; proj: string | null };
  const firstAny = new Map<string, Hit>();
  const firstMarked = new Map<string, Hit>();
  const firstProj = new Map<string, string>();
  const phoneLeadIds = new Map<string, string[]>();
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
    const ch = matchSaleChannel({
      blob,
      utmS,
      utmM,
      src: String(r.SOURCE_ID || "").toLowerCase(),
      directAd: !!String(r[F.direct] || "").trim(),
    });
    const proj = normSaleProject(String(r[LEAD_PROJECT_FIELD] || ""), projEnum);
    for (const p of ph) {
      const m = normalizeMobile(String(p.VALUE || ""));
      if (!m) continue;
      if (!firstAny.has(m)) firstAny.set(m, { ch, proj });
      if (MARKED.has(ch) && !firstMarked.has(m)) firstMarked.set(m, { ch, proj });
      if (proj && !firstProj.has(m)) firstProj.set(m, proj);
      let ids = phoneLeadIds.get(m);
      if (!ids) phoneLeadIds.set(m, (ids = []));
      ids.push(String(r.ID));
    }
  }

  // Проекты сделок: LEAD_ID → проект (фолбэк для лидов без проекта)
  const dealProjEnum = await enumMap("deal", DEAL_PROJECT_FIELD);
  const deals = await listAllFast("crm.deal.list", {
    select: ["ID", "LEAD_ID", DEAL_PROJECT_FIELD],
    filter: { "[>=DATE_CREATE]": `${DASHBOARD_START}T00:00:00` },
  });
  const leadDealProj = new Map<string, string>();
  for (const d of deals) {
    const lid = String(d.LEAD_ID || "");
    if (!lid || leadDealProj.has(lid)) continue;
    const proj = normSaleProject(String(d[DEAL_PROJECT_FIELD] || ""), dealProjEnum);
    if (proj) leadDealProj.set(lid, proj);
  }

  const map = new Map<string, PhoneAttribution>();
  for (const [m, any] of firstAny) {
    const hit = firstMarked.get(m) ?? any;
    let project = hit.proj ?? firstProj.get(m) ?? null;
    if (!project) {
      for (const lid of phoneLeadIds.get(m) || []) {
        const dp = leadDealProj.get(lid);
        if (dp) { project = dp; break; }
      }
    }
    map.set(m, { channel: hit.ch, project });
  }
  return map;
}
