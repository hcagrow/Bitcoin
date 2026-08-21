export function loadEntries<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEntries<T>(key: string, entries: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // storage full or unavailable — persistence is best-effort
  }
}

/** Inserts an entry, replacing any existing entry for the same date, and keeps the list sorted newest-first. */
export function upsertByDate<T extends { date: string }>(entries: T[], entry: T): T[] {
  const withoutDate = entries.filter((e) => e.date !== entry.date);
  return [...withoutDate, entry].sort((a, b) => b.date.localeCompare(a.date));
}

export function removeByDate<T extends { date: string }>(entries: T[], date: string): T[] {
  return entries.filter((e) => e.date !== date);
}
