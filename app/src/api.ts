import { Platform } from "react-native";
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" && typeof location !== "undefined"
    ? `${location.protocol}//${location.hostname}:8000/api`
    : "http://localhost:8000/api")
).replace(/\/$/, "");
let authToken: string | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function setAuthToken(token: string | null) {
  authToken = token;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 60000,
): Promise<T> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: abort.signal,
    });
    if (!response.ok) {
      let data: any;
      try {
        data = await response.json();
      } catch {
        data = { detail: response.statusText };
      }
      const detail = data.detail;
      throw new ApiError(
        Array.isArray(detail)
          ? detail.map((x: any) => x.msg).join(", ")
          : typeof detail === "string"
            ? detail
            : `Request failed (${response.status})`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    return await response.json();
  } catch (error: any) {
    if (error.name === "AbortError")
      throw new Error("ใช้เวลานานเกินไป กรุณาลองใหม่ / Request timed out");
    if (
      error.message === "Failed to fetch" ||
      error.message === "Network request failed"
    )
      throw new Error(
        "เชื่อมต่อบริการไม่ได้ ตรวจสอบว่า backend กำลังทำงาน / Service unavailable",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export async function apiBlob(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`File unavailable (${response.status})`);
    return await response.blob();
  } finally {
    clearTimeout(timer);
  }
}
export async function fileForm(asset: {
  uri: string;
  mimeType?: string;
  name?: string;
  file?: File;
}) {
  const data = new FormData();
  if (Platform.OS === "web") {
    const file = asset.file || (await (await fetch(asset.uri)).blob());
    data.append("file", file, asset.name || "image.png");
  } else
    data.append("file", {
      uri: asset.uri,
      type: asset.mimeType || "image/jpeg",
      name: asset.name || "image.jpg",
    } as any);
  return data;
}
