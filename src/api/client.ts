import { env } from "@/env";

export type RequestConfig<TData = unknown> = {
  method?: "GET" | "PUT" | "PATCH" | "POST" | "DELETE" | "OPTIONS" | "HEAD";
  url?: string;
  baseURL?: string;
  params?: Record<string, unknown>;
  data?: TData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type ResponseConfig<TData = unknown> = {
  data: TData;
  status: number;
  statusText: string;
  headers: Headers;
};

export type ResponseErrorConfig<TError = unknown> = {
  data: TError;
  status: number;
  statusText: string;
};

/** Type used by the generated hooks (option `client?`). */
export type Client = <TData, _TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
) => Promise<ResponseConfig<TData>>;

export class ApiError<TError = unknown> extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly data: TError,
  ) {
    super(`API ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Fetch wrapper consumed by the Kubb-generated hooks. This is a **public**
 * surface (guest invite flow) — no auth, no token injection.
 */
async function client<TData, _TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> {
  const baseURL = config.baseURL ?? env.VITE_API_URL;
  const url = `${baseURL}${config.url ?? ""}${buildQuery(config.params)}`;

  const headers = new Headers(config.headers);
  let body: BodyInit | undefined;
  if (config.data !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(config.data);
  }

  const res = await fetch(url, {
    method: config.method ?? "GET",
    headers,
    body,
    // jsdom (tests) doesn't support undici's AbortSignal shape.
    signal: env.VITE_ENV === "test" ? undefined : config.signal,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!res.ok) throw new ApiError(res.status, res.statusText, payload);

  return {
    data: payload as TData,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  };
}

export default client;
