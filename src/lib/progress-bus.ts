// Tiny pub/sub so any mutation can queue level-up / achievement popups without
// threading state through the tab components.

export type ProgressPopup =
  | { kind: "level"; key: string; level: number; title: string; dbl: number; gems: number }
  | {
      kind: "achievement";
      key: string;
      id: string;
      name: string;
      description: string;
      icon: string;
      dbl: number;
      gems: number;
    };

export interface ProgressPayload {
  levelUps?: { level: number; title: string; dbl: number; gems: number }[];
  unlocked?: {
    id: string;
    name: string;
    description: string;
    icon: string;
    dbl: number;
    gems: number;
  }[];
}

type Listener = (items: ProgressPopup[]) => void;
const listeners = new Set<Listener>();

export function subscribeProgress(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Fan out the `progress` block returned by the game server functions. */
export function pushProgress(payload?: ProgressPayload | null) {
  if (!payload) return;
  const items: ProgressPopup[] = [];
  for (const l of payload.levelUps ?? []) {
    items.push({ kind: "level", key: `level-${l.level}`, ...l });
  }
  for (const a of payload.unlocked ?? []) {
    items.push({ kind: "achievement", key: `ach-${a.id}`, ...a });
  }
  if (items.length === 0) return;
  for (const fn of listeners) fn(items);
}
