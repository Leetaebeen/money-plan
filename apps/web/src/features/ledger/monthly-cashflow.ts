import { today, validDate, type Entry } from "./model.ts";

export function monthlyCashflow(
  entries: Entry[],
  month: string,
  asOf = today(),
) {
  if (
    !validDate(`${month}-01`) ||
    !/^20\d{2}-\d{2}$/.test(month) ||
    !validDate(asOf) ||
    `${month}-01` > asOf
  )
    throw new Error("오늘까지의 조회 월을 선택해 주세요.");
  const endMonth = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  const rows = [];
  for (
    let value = Math.max(2000 * 12, endMonth - 5);
    value <= endMonth;
    value++
  ) {
    const key = `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
    const start = `${key}-01`;
    const end =
      key === asOf.slice(0, 7)
        ? asOf
        : new Date(Date.UTC(Math.floor(value / 12), (value % 12) + 1, 0))
            .toISOString()
            .slice(0, 10);
    const included = entries.filter(
      (e) =>
        e.date >= start &&
        e.date <= end &&
        ["INCOME", "EXPENSE", "REFUND"].includes(e.kind),
    );
    const income = included
      .filter((e) => e.kind === "INCOME")
      .reduce((sum, e) => sum + e.amount, 0);
    const spent = -included
      .filter((e) => e.kind === "EXPENSE")
      .reduce((sum, e) => sum + e.amount, 0);
    const refunded = included
      .filter((e) => e.kind === "REFUND")
      .reduce((sum, e) => sum + e.amount, 0);
    rows.push({
      month: key,
      end,
      count: included.length,
      income,
      spent,
      refunded,
      netSpent: spent - refunded,
      difference: income - spent + refunded,
    });
  }
  return rows;
}
