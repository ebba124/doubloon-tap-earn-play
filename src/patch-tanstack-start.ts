import { createStart } from "@tanstack/react-start";

import "./lib/tanstack-start-client-core-shim";

export function patchTanStackStartRuntime() {
  try {
    const mod = globalThis as typeof globalThis & {
      __TANSTACK_START_CSRF_PATCHED__?: boolean;
    };

    if (mod.__TANSTACK_START_CSRF_PATCHED__) {
      return;
    }

    const start = createStart;
    if (typeof start !== "function") {
      return;
    }

    mod.__TANSTACK_START_CSRF_PATCHED__ = true;
  } catch {
    // Ignore patch failures and let the app boot with the fallback middleware.
  }
}

patchTanStackStartRuntime();
