import { balance, today, validDate, type Goal, type Ledger } from "./model.ts";

export function goalHistory(goal: Goal, data: Ledger, asOf = today()) {
  if (!validDate(asOf)) throw new Error("목표 조회 기준일을 확인해 주세요.");
  const [year, month] = asOf.split("-").map(Number);
  const accounts = goal.accountIds.map((id) =>
    data.accounts.find((a) => a.id === id),
  );
  let previous: number | null = null;
  return Array.from({ length: 6 }, (_, index) => {
    const date =
      index === 5
        ? asOf
        : new Date(Date.UTC(year, month - 5 + index, 0))
            .toISOString()
            .slice(0, 10);
    if (!validDate(date)) return null;
    const balances = accounts.map((account) =>
      account ? balance(account, data.entries, date) : null,
    );
    const saved =
      balances.length && balances.every((value) => value !== null)
        ? balances.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null;
    const change =
      saved !== null && previous !== null ? saved - previous : null;
    previous = saved;
    return {
      date,
      saved,
      change,
      remaining: saved === null ? null : Math.max(0, goal.target - saved),
      percent:
        saved === null || goal.target <= 0
          ? null
          : Math.round((saved / goal.target) * 1000) / 10,
    };
  }).filter((row) => row !== null);
}
