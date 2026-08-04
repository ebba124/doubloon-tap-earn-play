// Browser-side helper for Telegram WebApp SDK
// Loaded via <script src="https://telegram.org/js/telegram-web-app.js"> in __root.

export interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  showAlert: (msg: string) => void;
  showPopup: (opts: { title?: string; message: string; buttons?: unknown[] }) => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getWebApp(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  const tg = getWebApp();
  if (tg?.initData) return tg.initData;
  // Fallback: Telegram also passes launch params in the URL hash/query
  // (tgWebAppData) — useful if the SDK script hasn't populated yet.
  if (typeof window !== "undefined") {
    for (const src of [window.location.hash.replace(/^#/, ""), window.location.search.replace(/^\?/, "")]) {
      const d = new URLSearchParams(src).get("tgWebAppData");
      if (d) return d;
    }
  }
  // Dev fallback: allow ?dev_user=<id> in URL
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const dev = url.searchParams.get("dev_user");
    if (dev) return `dev_user=${dev}`;
  }
  return "";
}

export function haptic(kind: "light" | "medium" | "heavy" = "light") {
  getWebApp()?.HapticFeedback?.impactOccurred(kind);
}

/**
 * Robustly opens a link from inside the Mini App. The bare
 * `openTelegramLink?.(...)` calls used before silently did nothing whenever the
 * method was unavailable (SDK not ready, opened in a browser, or an older
 * client). This tries every available path so the buttons always work:
 *   1. `openTelegramLink` for t.me links (keeps the user inside Telegram)
 *   2. `openLink` for anything else
 *   3. a plain `window.open` / location change fallback
 */
export function openLink(url: string) {
  if (!url) return;
  const tg = getWebApp();
  const isTelegramLink = /^https?:\/\/(t\.me|telegram\.me)\//i.test(url);

  try {
    if (tg && isTelegramLink && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(url);
      return;
    }
    if (tg && typeof tg.openLink === "function") {
      tg.openLink(url);
      return;
    }
    if (tg && isTelegramLink && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(url);
      return;
    }
  } catch {
    // fall through to the browser fallback below
  }

  if (typeof window !== "undefined") {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) window.location.href = url;
  }
}

export function makeNonce() {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6)
  );
}
