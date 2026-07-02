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

// Батч-вызов: до 50 команд одним HTTP-запросом (POST /batch.json).
// cmd — относительные URL методов ("crm.lead.list?..."); внутри допустимы
// ссылки $result[имя][индекс][поле] на результат предыдущей команды батча.
export async function batchCall(
  cmds: Record<string, string>
): Promise<Record<string, unknown>> {
  const BASE = base();
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL не задан в .env");
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`${BASE}/batch.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ halt: 0, cmd: cmds }),
      });
      if (res.status === 200) {
        const json = (await res.json()) as {
          result?: { result?: Record<string, unknown> };
        };
        return json.result?.result || {};
      }
    } catch {
      // сетевой обрыв — подождать и повторить
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error("Bitrix batch: превышен лимит повторов");
}

// Быстрый listAll: те же seek-страницы по ID, но пачками по 25 через batch
// с цепочкой $result — в ~25 раз меньше HTTP-запросов (62К лидов ≈ 40 сек
// против ~8 мин у listAll). Семантика результата идентична listAll.
// НЕЛЬЗЯ переходить на offset-пагинацию (start=N): на этом портале она
// молча возвращает пустоту после ~42 500 записей — теряются свежие лиды.
export async function listAllFast(
  method: string,
  opts: { select: string[]; filter?: Record<string, string> } = { select: [] },
  onProgress?: (fetched: number) => void
): Promise<Dict[]> {
  const select = opts.select.includes("ID")
    ? opts.select
    : ["ID", ...opts.select];
  const PAGES = 25;
  const sel = select.map((s, i) => `select[${i}]=${s}`).join("&");
  const flt = Object.entries(opts.filter || {})
    .map(([k, v]) => `filter${k}=${encodeURIComponent(v)}`)
    .join("&");
  // fromId подставляется в конец, чтобы $result-ссылка осталась сырой строкой
  const pageCmd = (fromId: string) =>
    `${method}?order[ID]=ASC&start=-1&${sel}${flt ? "&" + flt : ""}&filter[>ID]=${fromId}`;

  const out: Dict[] = [];
  let lastId = 0;
  let done = false;
  // защита от бесконечного цикла (4096 × 1250 = 5,12 млн записей)
  for (let round = 0; round < 4096 && !done; round++) {
    const cmds: Record<string, string> = { c0: pageCmd(String(lastId)) };
    for (let i = 1; i < PAGES; i++)
      cmds[`c${i}`] = pageCmd(`$result[c${i - 1}][49][ID]`);
    const res = await batchCall(cmds);
    for (let i = 0; i < PAGES; i++) {
      const rows = (res[`c${i}`] as Dict[]) || [];
      out.push(...rows);
      if (rows.length) lastId = Number(rows[rows.length - 1].ID);
      // неполная страница = конец данных; остаток батча — неразрешённые
      // $result-ссылки, их результатам верить нельзя
      if (rows.length < 50) {
        done = true;
        break;
      }
    }
    onProgress?.(out.length);
    if (!done) await sleep(300); // бережём лимит запросов
  }
  // Хвост одиночными страницами — на случай, если конец батча совпал с
  // границей страницы и после «короткой» страницы данные всё же остались.
  for (let page = 0; page < 100000; page++) {
    const params: Dict = { "order[ID]": "ASC", start: -1 };
    select.forEach((s, i) => (params[`select[${i}]`] = s));
    for (const [k, v] of Object.entries(opts.filter || {}))
      params[`filter${k}`] = v;
    params["filter[>ID]"] = lastId;
    const res = await call(method, params);
    const rows = (res.result as Dict[]) || [];
    if (!rows.length) break;
    out.push(...rows);
    lastId = Number(rows[rows.length - 1].ID);
    if (rows.length < 50) break;
    await sleep(120);
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
