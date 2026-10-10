import { balance, today, validDate, type Ledger } from "./model.ts";
import { scheduleMonth } from "./schedules.ts";

export function upcomingPayments(data: Ledger, asOf = today()) {
  if (!validDate(asOf)) throw new Error("조회 기준일을 확인해 주세요.");
  const end = new Date(
    Math.min(Date.parse(asOf) + 29 * 86400000, Date.parse("2099-12-31")),
  )
    .toISOString()
    .slice(0, 10);
  const months = new Set<string>();
  for (let day = Date.parse(asOf); day <= Date.parse(end); day += 86400000)
    months.add(new Date(day).toISOString().slice(0, 7));
  const rows = [...months]
    .flatMap((month) => scheduleMonth(data, month, asOf))
    .filter((r) => !r.payment && r.dueDate >= asOf && r.dueDate <= end)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.schedule.name.localeCompare(b.schedule.name, "ko"),
    );
  const overdue = scheduleMonth(data, asOf.slice(0, 7), asOf).filter(
    (r) => !r.payment && r.dueDate < asOf,
  );
  const accountIds = new Set(rows.map((r) => r.schedule.accountId));
  const accounts = [...accountIds].map((id) => {
    const account = data.accounts.find((a) => a.id === id)!;
    const required = rows
      .filter((r) => r.schedule.accountId === id)
      .reduce((n, r) => n + r.schedule.amount, 0);
    // Savings, investment and credit balances are not assumed to be spendable cash.
    const current = ["SALARY", "FIXED", "LIVING"].includes(account.role)
      ? balance(account, data.entries, asOf)
      : null;
    const shortfall =
      current === null ? null : Math.max(0, required - current);
    return { account, required, current, shortfall };
  });
  return {
    asOf,
    end,
    rows,
    overdue,
    accounts,
    total: rows.reduce((n, r) => n + r.schedule.amount, 0),
  };
}
