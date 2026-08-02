import { useSyncExternalStore } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import {
  isMuted,
  setMuted,
  subscribeMuted,
  primeAudio,
  playClaim,
} from "@/lib/sound";

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

export function SettingsSheet({
  open,
  onClose,
  dblPerUsdt,
}: {
  open: boolean;
  onClose: () => void;
  dblPerUsdt: number;
}) {
  const muted = useMuted();
  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Settings</h2>
          <button className="ghost-btn" style={{ padding: 8 }} aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <button
          className="list-row w-full"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (!next) {
              primeAudio();
              playClaim();
            }
          }}
        >
          <div className="flex items-center gap-3">
            {muted ? (
              <VolumeX size={22} className="text-[var(--muted-foreground)]" />
            ) : (
              <Volume2 size={22} className="text-[var(--gold)]" />
            )}
            <div className="text-left">
              <div className="font-semibold">Sound effects</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {muted ? "Muted" : "Taps, wins & spins play sound"}
              </div>
            </div>
          </div>
          <span className="badge">{muted ? "Off" : "On"}</span>
        </button>

        <div className="stat-card mt-3">
          <div className="text-xs text-[var(--muted-foreground)]">Exchange rate</div>
          <div className="font-bold text-[var(--gold)]">
            {dblPerUsdt.toLocaleString()} DBL = $1
          </div>
        </div>
      </div>
    </div>
  );
}
