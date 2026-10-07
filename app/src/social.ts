import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { storage } from "./storage";
import { post } from "./api";
import type { User } from "../../shared/api";

export type OAuthResult =
  | { token: string; user: User; linked: false; provider: string }
  | { linked: true; user: User; provider: string };
type Pending = {
  verifier: string;
  created: number;
  intent: "login" | "link";
  handoffCode?: string;
  handoffReceived?: number;
};
const flowLifetime = 10 * 60 * 1000;
const handoffLifetime = 60 * 1000;
const exchanges = new Map<
  string,
  { started: number; promise: Promise<OAuthResult> }
>();
let flowGeneration = 0;
const key = "scamgraph-oauth-pending";
export function authErrorMessage(message: string, english = false) {
  const known: Record<string, [string, string]> = {
    "Login provider is not configured": [
      "การเข้าสู่ระบบด้วย Google/LINE ยังไม่เปิดใช้งาน ใช้อีเมลได้ระหว่างรอเชื่อมต่อ",
      "Google/LINE sign-in is not configured yet. You can use email in the meantime.",
    ],
    "Invalid email or password": [
      "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "Email or password is incorrect",
    ],
    "Email or password is incorrect": [
      "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "Email or password is incorrect",
    ],
    account_link_required: [
      "อีเมลนี้มีบัญชีอยู่แล้ว เข้าสู่ระบบด้วยอีเมลก่อน แล้วเชื่อม Google ในหน้าตั้งค่า",
      "This email already has an account. Sign in with email, then link Google in Settings.",
    ],
    provider_already_linked: [
      "บัญชีผู้ให้บริการนี้เชื่อมกับบัญชีอื่นอยู่แล้ว",
      "This provider identity is already linked to another account.",
    ],
    account_already_has_provider: [
      "บัญชีของคุณเชื่อมผู้ให้บริการนี้อยู่แล้ว",
      "Your account already has this provider linked.",
    ],
    provider_denied: ["ยกเลิกการเข้าสู่ระบบแล้ว", "Sign-in was cancelled."],
    provider_timeout: [
      "ผู้ให้บริการตอบกลับช้า กรุณาลองใหม่",
      "The provider timed out. Please try again.",
    ],
    provider_login_failed: [
      "ยืนยันการเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      "Sign-in could not be verified. Please try again.",
    ],
  };
  return known[message]?.[english ? 1 : 0] || message;
}
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64url(bytes: Uint8Array) {
  let out = "",
    bits = 0,
    value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += alphabet[(value >>> bits) & 63];
    }
  }
  if (bits) out += alphabet[(value << (6 - bits)) & 63];
  return out;
}
const pendingStore = {
  get: async () =>
    Platform.OS === "web" ? sessionStorage.getItem(key) : storage.get(key),
  set: async (value: string) => {
    if (Platform.OS === "web") sessionStorage.setItem(key, value);
    else await storage.set(key, value);
  },
  remove: async () => {
    if (Platform.OS === "web") sessionStorage.removeItem(key);
    else await storage.remove(key);
  },
};
function readPending(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const pending: Pending = JSON.parse(raw);
    const age = Date.now() - pending.created;
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier) ||
      !Number.isFinite(pending.created) ||
      age < 0 ||
      age >= flowLifetime ||
      !["login", "link"].includes(pending.intent)
    )
      return null;
    return pending;
  } catch {
    return null;
  }
}
export function isOAuthCallback(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.hash) return false;
    const targetMatches =
      Platform.OS === "web"
        ? parsed.origin === location.origin && parsed.pathname === "/"
        : parsed.protocol === "scamgraph:" &&
          parsed.hostname === "oauth" &&
          !parsed.port &&
          ["", "/"].includes(parsed.pathname);
    return (
      targetMatches &&
      (parsed.searchParams.has("exchange_code") ||
        parsed.searchParams.has("oauth_error"))
    );
  } catch {
    return false;
  }
}
function handoffValid(pending: Pending): boolean {
  const age = Date.now() - (pending.handoffReceived || 0);
  return (
    typeof pending.handoffCode === "string" &&
    pending.handoffCode.length >= 30 &&
    age >= 0 &&
    age < handoffLifetime
  );
}
export async function hasOAuthRetry(): Promise<boolean> {
  const pending = readPending(await pendingStore.get());
  if (pending && handoffValid(pending)) return true;
  if (pending && !pending.handoffCode) return false;
  await pendingStore.remove();
  return false;
}
export async function clearOAuthState(): Promise<void> {
  flowGeneration += 1;
  exchanges.clear();
  await pendingStore.remove();
}
async function redeem(code: string, pending: Pending): Promise<OAuthResult> {
  const now = Date.now();
  for (const [key, flight] of exchanges)
    if (now - flight.started >= handoffLifetime) exchanges.delete(key);
  const existing = exchanges.get(code);
  if (existing) return existing.promise;
  const generation = flowGeneration;
  const promise = (async () => {
    try {
      const response = await post<OAuthResult>("/auth/oauth/exchange", {
        code,
        code_verifier: pending.verifier,
      });
      if (generation !== flowGeneration)
        throw new Error("คำขอถูกยกเลิกแล้ว / Sign-in request was cancelled");
      if (
        (pending.intent === "link" &&
          !(response.linked === true && !("token" in response))) ||
        (pending.intent === "login" &&
          !("token" in response && typeof response.token === "string"))
      ) {
        await pendingStore.remove();
        throw new Error(
          "ยืนยันชนิดคำขอไม่ได้ / Sign-in flow could not be verified",
        );
      }
      await pendingStore.remove();
      return response;
    } catch (error: any) {
      if (generation !== flowGeneration) throw error;
      // Retry only a transport/timeout/server failure while the one-use handoff
      // remains locally fresh. The backend still enforces its own 60-second TTL.
      const retryable =
        (typeof error.status !== "number" || error.status >= 500) &&
        handoffValid(pending);
      if (!retryable) await pendingStore.remove();
      exchanges.delete(code);
      throw error;
    }
  })();
  exchanges.set(code, { started: now, promise });
  while (exchanges.size > 8) exchanges.delete(exchanges.keys().next().value!);
  return promise;
}
async function exchange(url: string): Promise<OAuthResult | null> {
  if (!isOAuthCallback(url)) return null;
  const parsed = new URL(url);
  const code = parsed.searchParams.get("exchange_code");
  const failure = parsed.searchParams.get("oauth_error");
  if (!code && !failure) return null;
  if (Platform.OS === "web") history.replaceState(null, "", location.pathname);
  if (failure) {
    await pendingStore.remove();
    throw new Error(failure);
  }
  const completed = code && exchanges.get(code);
  if (completed && Date.now() - completed.started < handoffLifetime)
    return completed.promise;
  const pending = readPending(await pendingStore.get());
  if (!pending || !code) {
    await pendingStore.remove();
    throw new Error(
      "ไม่พบคำขอเข้าสู่ระบบที่เริ่มจากอุปกรณ์นี้ / Sign-in request not found",
    );
  }
  if (pending.handoffCode && pending.handoffCode !== code)
    throw new Error(
      "มีคำขออื่นรอดำเนินการ / Another sign-in handoff is pending",
    );
  pending.handoffCode = code;
  pending.handoffReceived ??= Date.now();
  if (!handoffValid(pending)) {
    await pendingStore.remove();
    throw new Error(
      "คำขอเข้าสู่ระบบหมดอายุ เริ่มใหม่ / Sign-in handoff expired; start again",
    );
  }
  await pendingStore.set(JSON.stringify(pending));
  return redeem(code, pending);
}
export async function finishOAuthRedirect(url?: string | null) {
  const incoming =
    url ||
    (Platform.OS === "web" ? location.href : await Linking.getInitialURL());
  return incoming ? exchange(incoming) : null;
}
export async function retryOAuthExchange(): Promise<OAuthResult | null> {
  const pending = readPending(await pendingStore.get());
  if (!pending || !handoffValid(pending)) {
    await pendingStore.remove();
    throw new Error(
      "คำขอเข้าสู่ระบบหมดอายุ เริ่มใหม่ / Sign-in handoff expired; start again",
    );
  }
  return redeem(pending.handoffCode!, pending);
}
export async function startSocial(
  provider: "google" | "line",
  intent: "login" | "link" = "login",
) {
  await clearOAuthState();
  const verifier = base64url(await Crypto.getRandomBytesAsync(32));
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
  );
  const code_challenge = base64url(
    Uint8Array.from(digest.match(/../g)!.map((x) => parseInt(x, 16))),
  );
  const redirect_uri =
    Platform.OS === "web" ? `${location.origin}/` : "scamgraph://oauth";
  const started = await post<{ authorization_url: string }>(
    `/auth/oauth/${provider}/start`,
    { redirect_uri, code_challenge, intent },
  );
  await pendingStore.set(
    JSON.stringify({ verifier, created: Date.now(), intent }),
  );
  if (Platform.OS === "web") {
    location.assign(started.authorization_url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(
    started.authorization_url,
    redirect_uri,
  );
  if (result.type === "success") return exchange(result.url);
  await pendingStore.remove();
  return null;
}
