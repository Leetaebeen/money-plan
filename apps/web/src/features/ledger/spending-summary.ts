import { today, validDate, type Entry } from "./model.ts";

export function spendingSummary(entries: Entry[], asOf = today()) {
  if (!validDate(asOf)) throw new Error("조회 기준일을 확인해 주세요.");
  const categories = new Map<
    string,
    { category: string; spent: number; refunded: number; count: number }
  >();
  for (const entry of entries) {
    if (
      entry.date > asOf ||
      (entry.kind !== "EXPENSE" && entry.kind !== "REFUND")
    )
      continue;
    const category = entry.category.trim() || "미분류";
    const row = categories.get(category) ?? {
      category,
      spent: 0,
      refunded: 0,
      count: 0,
    };
    if (entry.kind === "EXPENSE") row.spent -= entry.amount;
    else row.refunded += entry.amount;
    row.count++;
    categories.set(category, row);
  }
  const rows = [...categories.values()]
    .map((r) => ({ ...r, net: r.spent - r.refunded }))
    .sort(
      (a, b) => b.net - a.net || a.category.localeCompare(b.category, "ko"),
    );
  const spent = rows.reduce((n, r) => n + r.spent, 0);
  const refunded = rows.reduce((n, r) => n + r.refunded, 0);
  return {
    rows,
    spent,
    refunded,
    net: spent - refunded,
    count: rows.reduce((n, r) => n + r.count, 0),
  };
}
