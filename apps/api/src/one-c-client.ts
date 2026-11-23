import { ProductionError } from "./production-rules.js";

type ODataEnvelope<T> = { value?: T[]; d?: { results?: T[]; __next?: string } };

export class OneCClient {
  private readonly base: string;
  private readonly authorization: string;

  constructor(baseUrl: string, user: string, password: string) {
    this.base = baseUrl.replace(/\/$/, "");
    this.authorization = `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
  }

  async list<T>(entity: string, query: Record<string, string | number>): Promise<T[]> {
    const rows: T[] = [];
    const pageSize = 200;
    for (let skip = 0; ; skip += pageSize) {
      const params = new URLSearchParams({ $format: "json" });
      for (const [key, value] of Object.entries(query)) params.set(key, String(value));
      params.set("$top", String(pageSize)); params.set("$skip", String(skip));
      const serialized=params.toString().replaceAll("+","%20");
      const response = await fetch(`${this.base}/${entity}?${serialized}`, {
        headers: { authorization: this.authorization, accept: "application/json" },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        const detail=(await response.text()).replace(/\s+/g," ").slice(0,300);
        throw new ProductionError(502, `1С не ответила на запрос ${entity} (${response.status}): ${detail}`);
      }
      const body = await response.json() as ODataEnvelope<T>;
      const page = body.value ?? body.d?.results ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }
}

export function oneCClientFromEnv(): OneCClient {
  const base = process.env.UNF_1C_BASE_URL?.trim();
  const user = process.env.UNF_1C_USER?.trim();
  const password = process.env.UNF_1C_PASSWORD;
  if (!base || !user || !password) throw new ProductionError(503, "Подключение к 1С не настроено");
  return new OneCClient(base, user, password);
}
