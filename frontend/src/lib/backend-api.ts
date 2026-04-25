const API_BASE = (import.meta.env.VITE_BACKEND_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function formatErrorMessage(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => formatErrorMessage(item)).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Request failed";
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const nested =
      formatErrorMessage(record.message) ||
      formatErrorMessage(record.error_description) ||
      formatErrorMessage(record.error) ||
      formatErrorMessage(record.detail);
    if (nested && nested !== "Request failed") return nested;
    try {
      return JSON.stringify(detail);
    } catch {
      return "Request failed";
    }
  }
  return "Request failed";
}

async function request<T>(
  path: string,
  method: Method = "GET",
  token?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const json = await response.json();
      console.error("Backend API error:", {
        path,
        method,
        status: response.status,
        body: json,
      });
      message = formatErrorMessage(json?.detail ?? json?.message ?? json);
    } catch {
      console.error("Backend API error:", {
        path,
        method,
        status: response.status,
      });
      // ignore json parsing error
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const backendApi = {
  get: <T>(path: string, token?: string) => request<T>(path, "GET", token),
  post: <T>(path: string, token: string | undefined, body?: unknown) =>
    request<T>(path, "POST", token, body),
  patch: <T>(path: string, token: string | undefined, body?: unknown) =>
    request<T>(path, "PATCH", token, body),
  put: <T>(path: string, token: string | undefined, body?: unknown) =>
    request<T>(path, "PUT", token, body),
  delete: <T>(path: string, token?: string) => request<T>(path, "DELETE", token),
};
