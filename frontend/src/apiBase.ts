function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Backend origin for API calls (no trailing slash; do not include `/api`).
 * - Production: empty → browser uses same origin (`/api/...`).
 * - `vite dev`: defaults to `http://localhost:4000` so `/api` works even when the page is not served by Vite (Live Server, etc.). Override with `VITE_API_URL`.
 */
export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return trimTrailingSlashes(fromEnv.trim());
  }
  if (import.meta.env.DEV) {
    return "http://localhost:4000";
  }
  return "";
}

/** Absolute or same-origin path for `fetch` (path must start with `/`, e.g. `/api/layered/health`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiBaseUrl();
  return base ? `${base}${p}` : p;
}
