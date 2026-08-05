import { useSyncExternalStore } from "react";
import { isMuted, subscribeMuted } from "@/lib/sound";

function useMuted() {
  return useSyncExternalStore(
    subscribeMuted,
    () => isMuted(),
    () => false,
  );
}

export function useMutedState() {
  return useMuted();
}
