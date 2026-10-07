import { useEffect, useState } from "react";
import { Platform } from "react-native";

type InstallPrompt = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export type WebappState = {
  isWeb: boolean;
  /** Browser connectivity hint. It does not mean the analysis API is healthy. */
  online: boolean;
  installed: boolean;
  canInstall: boolean;
  installState: "idle" | "prompting" | "accepted" | "dismissed" | "manual" | "error";
  installHint: "ios" | "browser" | "insecure" | "native";
  updateReady: boolean;
  workerState: "unsupported" | "development" | "registering" | "ready" | "error";
};
const web = Platform.OS === "web" && typeof window !== "undefined";
const subscribers = new Set<(state: WebappState) => void>();
let promptEvent: InstallPrompt | null = null;
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let reloadingForUpdate = false;
const isInstalled = () => web && (window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIOS = () => web && (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
  /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let state: WebappState = {
  isWeb: web,
  online: web ? navigator.onLine : true,
  installed: isInstalled(),
  canInstall: false,
  installState: "idle",
  installHint: !web ? "native" : !window.isSecureContext ? "insecure" : isIOS() ? "ios" : "browser",
  updateReady: false,
  workerState: !web || !("serviceWorker" in navigator) ? "unsupported" : "registering",
};
function publish(patch: Partial<WebappState>) {
  state = { ...state, ...patch };
  for (const listener of subscribers) listener(state);
}
function checkWaitingWorker() {
  publish({ updateReady: !!registration?.waiting && !!navigator.serviceWorker.controller });
}
function observeWorker(worker: ServiceWorker | null) {
  if (!worker) return;
  const check = () => {
    if (worker.state === "activated") publish({ workerState: "ready" });
    if (worker.state === "redundant" && !navigator.serviceWorker.controller) publish({ workerState: "error" });
    if (worker.state === "installed") {
      // The registration's waiting pointer can update after this state event.
      window.setTimeout(checkWaitingWorker, 0);
    }
  };
  worker.addEventListener("statechange", check);
  check();
}
function initialise() {
  if (!web || started) return;
  started = true;
  window.addEventListener("online", () => publish({ online: true }));
  window.addEventListener("offline", () => publish({ online: false }));
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event as InstallPrompt;
    publish({ canInstall: true, installState: "idle" });
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    publish({ installed: true, canInstall: false, installState: "accepted" });
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
    publish({ installed: isInstalled() });
  });
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    publish({ workerState: "unsupported" });
    return;
  }
  // Development Metro output has no generated worker. Never let an old worker
  // serve a development bundle; use a different origin/port for production.
  if (__DEV__) {
    publish({ workerState: "development" });
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) window.location.reload();
  });
  navigator.serviceWorker.register("/service-worker.js", { scope: "/", updateViaCache: "none" })
    .then(value => {
      registration = value;
      if (navigator.serviceWorker.controller) publish({ workerState: "ready" });
      observeWorker(value.installing);
      observeWorker(value.waiting);
      observeWorker(value.active);
      checkWaitingWorker();
      value.addEventListener("updatefound", () => {
        observeWorker(value.installing);
      });
    }).catch(() => publish({ workerState: "error" }));
}
async function install(): Promise<WebappState["installState"]> {
  if (!web || !promptEvent) {
    publish({ installState: "manual" });
    return "manual";
  }
  const event = promptEvent;
  promptEvent = null;
  publish({ installState: "prompting", canInstall: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    // Accepted means the browser accepted the prompt, not installation proof.
    // Only appinstalled or standalone display marks the app installed.
    publish({ installState: choice.outcome });
    return choice.outcome;
  } catch {
    publish({ installState: "error" });
    return "error";
  }
}
function applyUpdate(): boolean {
  if (!web || !registration?.waiting) return false;
  reloadingForUpdate = true;
  registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  return true;
}

/** Public-shell PWA lifecycle. No authentication, uploads, or result persistence. */
export function useWebapp() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    subscribers.add(setSnapshot);
    initialise();
    setSnapshot(state);
    return () => { subscribers.delete(setSnapshot); };
  }, []);
  return { ...snapshot, install, applyUpdate };
}
