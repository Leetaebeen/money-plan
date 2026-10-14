import type { Entry, EntryKind, Ledger } from "./model.ts";

export function unclassifiedCardIds(
  data: Pick<Ledger, "accounts" | "entries">,
): Set<string> {
  const cards = new Set(
    data.accounts.filter((a) => a.role === "CREDIT_CARD").map((a) => a.id),
  );
  return new Set(
    data.entries
      .filter(
        (entry) =>
          cards.has(entry.accountId) &&
          (entry.kind === "EXPENSE" || entry.kind === "REFUND") &&
          !entry.cardBudget,
      )
      .map((entry) => entry.id),
  );
}

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

export function transactionPage(entries: Entry[], requested: number) {
  const pages = Math.max(1, Math.ceil(entries.length / 30));
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.isFinite(requested) ? Math.floor(requested) : 0),
  );
  const start = page * 30;
  return {
    page,
    pages,
    entries: entries.slice(start, start + 30),
    from: entries.length ? start + 1 : 0,
    to: Math.min(start + 30, entries.length),
  };
}

export function possibleDuplicateIds(entries: Entry[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    if (
      entry.kind !== "EXPENSE" &&
      entry.kind !== "INCOME" &&
      entry.kind !== "REFUND"
    )
      continue;
    const description = entry.description
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    const key = JSON.stringify([
      entry.accountId,
      entry.date,
      entry.kind,
      entry.amount,
      description,
    ]);
    const ids = groups.get(key) ?? [];
    ids.push(entry.id);
    groups.set(key, ids);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}
