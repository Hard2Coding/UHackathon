import { useEffect } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import {
  getCallerStatus,
  syncCallerDirectory,
  CallerDirectory,
} from "../modules/scamgraph-caller";

/** Refresh public, verified evidence on foreground only after device activation.
 * Incoming phone numbers are never uploaded. Offline calls use cached evidence. */
export function useCallerEvidenceRefresh() {
  useEffect(() => {
    let running = false,
      stopped = false;
    const refresh = async () => {
      if (running || stopped) return;
      running = true;
      try {
        const status = await getCallerStatus();
        if (
          status.available &&
          status.enabled &&
          (!status.cacheCurrent ||
            Date.parse(status.cacheExpiresAt || "") <
              Date.now() + 30 * 60 * 1000)
        ) {
          const directory = await api<CallerDirectory>("/caller-id/directory");
          if (!stopped) await syncCallerDirectory(directory);
        }
      } catch {
        /* Offline/cache errors never generate a safety verdict. */
      } finally {
        running = false;
      }
    };
    refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      stopped = true;
      listener.remove();
    };
  }, []);
}
