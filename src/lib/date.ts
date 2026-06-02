/**
 * Returns the current UTC timestamp as an ISO 8601 string.
 * Use instead of new Date().toISOString() to make UTC intent explicit.
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Formats a Date or ISO string as a UTC ISO 8601 string.
 * Use for all persistence (Supabase inserts/updates) and API responses.
 */
export function formatDate(date: Date | string): string {
  return (typeof date === "string" ? new Date(date) : date).toISOString();
}

/**
 * Formats a Date or ISO string for display in the UI.
 * Always renders in UTC to avoid timezone-shifted dates for the user.
 *
 * @param locale - BCP 47 locale tag (default: "pl-PL")
 * @param options - Intl.DateTimeFormat options merged on top of the UTC default
 */
export function formatDateDisplay(
  date: Date | string,
  locale = "pl-PL",
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(d);
}
