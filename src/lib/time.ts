export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/New_York";

function dateParts(value: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function appTodayIso(now = new Date()): string {
  const parts = dateParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatMatchDate(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(value));
}

export function formatMatchTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
