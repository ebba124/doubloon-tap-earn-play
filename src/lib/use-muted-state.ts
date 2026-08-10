import { useSyncExternalStore } from "react";
import { isMuted, subscribeMuted } from "@/lib/sound";

export function useMutedState() {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false);
}
