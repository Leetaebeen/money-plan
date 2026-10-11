import type { Entry, EntryKind } from "./model.ts";

export function searchTransactions(
  entries: Entry[],
  filters: {
    month: string;
    accountId: string;
    kind: EntryKind | "";
    query: string;
  },
) {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      if (filters.month && !entry.date.startsWith(filters.month)) return false;
      if (filters.accountId && entry.accountId !== filters.accountId)
        return false;
      if (filters.kind && entry.kind !== filters.kind) return false;
      const text = normalize(`${entry.description} ${entry.category}`);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
