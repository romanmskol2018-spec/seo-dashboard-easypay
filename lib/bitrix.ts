// Клиент Bitrix24 REST через входящий вебхук.
// URL берётся из BITRIX_WEBHOOK_URL (.env) — это секрет, в репозиторий не уходит.
// Пагинация — через "seek" по ID (order[ID]=ASC, filter[>ID]=last, start=-1),
// как рекомендует Bitrix для больших списков (быстрее offset-пагинации).

type Dict = Record<string, unknown>;

// Читаем вебхук лениво — .env подгружается рантаймом Prisma при старте скрипта.
// Чистим хвосты, которые часто попадают при вставке в GitHub-секрет:
// пробелы, переносы строк, кавычки по краям, лишние слэши.
function base(): string {
  return (process.env.BITRIX_WEBHOOK_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(/\/+$/, "");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Низкоуровневый вызов метода с ретраями на лимит запросов.
export async function call(method: string, params: Dict = {}): Promise<{
  result: unknown;
  total?: number;
  next?: number;
}> {
  const BASE = base();
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL не задан в .env");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const url = `${BASE}/${method}.json?${qs.toString()}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(url);
      const json = (await res.json()) as Dict;
      if (json.error) {
        const code = String(json.error);
        // лимит запросов / временная — подождать и повторить
        if (code === "QUERY_LIMIT_EXCEEDED" || res.status === 503) {
          await sleep(700 * (attempt + 1));
          continue;
        }
        throw new Error(`Bitrix ${method}: ${code} — ${json.error_description}`);
      }
      return json as { result: unknown; total?: number; next?: number };
    } catch (e) {
      // сетевой обрыв (UND_ERR_SOCKET и т.п.) — подождать и повторить
      const msg = String((e as Error)?.message || e);
      if (msg.includes("Bitrix ")) throw e; // ошибка API — не ретраим
      if (attempt === 7) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(`Bitrix ${method}: превышен лимит повторов`);
}

// Получить все записи списка (crm.lead.list / crm.deal.list) seek-пагинацией.
export async function listAll(
  method: string,
  opts: { select: string[]; filter?: Record<string, string> } = { select: [] }
): Promise<Dict[]> {
  const select = opts.select.includes("ID")
    ? opts.select
    : ["ID", ...opts.select];
  const out: Dict[] = [];
  let lastId = 0;
  // защита от бесконечного цикла
  for (let page = 0; page < 100000; page++) {
    const params: Dict = { "order[ID]": "ASC", start: -1 };
    select.forEach((s, i) => (params[`select[${i}]`] = s));
    for (const [k, v] of Object.entries(opts.filter || {})) {
      params[`filter${k}`] = v;
    }
    params["filter[>ID]"] = lastId;
    const res = await call(method, params);
    const rows = (res.result as Dict[]) || [];
    if (!rows.length) break;
    out.push(...rows);
    lastId = Number(rows[rows.length - 1].ID);
    if (rows.length < 50) break;
    await sleep(120); // лёгкая пауза — бережём лимит и соединение
  }
  return out;
}

// Узнать total для фильтра (1 запрос).
export async function totalFor(
  method: string,
  filter: Record<string, string> = {}
): Promise<number> {
  const params: Dict = { start: 0, "select[0]": "ID" };
  for (const [k, v] of Object.entries(filter)) params[`filter${k}`] = v;
  const res = await call(method, params);
  return res.total ?? 0;
}

// Карта значений списочного поля (enum): ID -> текст.
export async function enumMap(
  entity: "lead" | "deal",
  fieldId: string
): Promise<Record<string, string>> {
  const res = await call(`crm.${entity}.fields`);
  const field = (res.result as Dict)[fieldId] as Dict | undefined;
  const items = (field?.items as Dict[]) || [];
  const map: Record<string, string> = {};
  for (const it of items) map[String(it.ID)] = String(it.VALUE);
  return map;
}
