/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    // Vitest's default `include` glob also matches Playwright's e2e/*.spec.ts
    // files. Loading those pulls in @playwright/test -> playwright-core, whose
    // bundled chromium-bidi require()s fail Vite's SSR dep optimizer. Restrict
    // collection to this project's actual unit/integration tests under src/.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
