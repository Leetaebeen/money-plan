import { today, validDate, type Entry } from "./model.ts";

export function compareMonthlySpending(
  entries: Entry[],
  month: string,
  asOf = today(),
) {
  if (!validDate(asOf)) throw new Error("조회 기준일을 확인해 주세요.");
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !validDate(`${month}-01`) ||
    month > asOf.slice(0, 7)
  )
    return null;
  const start = `${month}-01`;
  const previousLast = new Date(Date.parse(start) - 86400000)
    .toISOString()
    .slice(0, 10);
  const previousMonth = previousLast.slice(0, 7);
  const nextMonth = new Date(`${start}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end =
    month === asOf.slice(0, 7)
      ? asOf
      : new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);
  const previousEnd =
    month === asOf.slice(0, 7)
      ? `${previousMonth}-${String(Math.min(Number(asOf.slice(8)), Number(previousLast.slice(8)))).padStart(2, "0")}`
      : previousLast;
  const current = spendingSummary(
    entries.filter((e) => e.date >= start && e.date <= end),
    asOf,
  );
  const previous = spendingSummary(
    entries.filter(
      (e) => e.date >= `${previousMonth}-01` && e.date <= previousEnd,
    ),
    asOf,
  );
  return {
    start,
    end,
    previousStart: `${previousMonth}-01`,
    previousEnd,
    current,
    previous,
    difference:
      current.count && previous.count ? current.net - previous.net : null,
  };
}

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
