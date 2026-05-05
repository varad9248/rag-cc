export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, "");

const toApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const getErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeDetail = (payload as { detail?: unknown }).detail;
  if (typeof maybeDetail === "string" && maybeDetail.trim()) return maybeDetail;
  return null;
};

type ApiFetchOptions = RequestInit & {
  token?: string | null;
};

export const apiFetch = async (path: string, options: ApiFetchOptions = {}): Promise<Response> => {
  const { token, headers: inputHeaders, ...requestInit } = options;
  const headers = new Headers(inputHeaders ?? undefined);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(toApiUrl(path), {
    ...requestInit,
    headers,
  });

  if (response.ok) return response;

  let message = `Request failed with status ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      const detailMessage = getErrorMessage(payload);
      if (detailMessage) message = detailMessage;
    } catch {
      // ignore JSON parse errors and fall back to default status message
    }
  } else {
    try {
      const text = await response.text();
      if (text.trim()) message = text.trim();
    } catch {
      // ignore read errors and fall back to default status message
    }
  }

  throw new ApiError(message, response.status);
};
