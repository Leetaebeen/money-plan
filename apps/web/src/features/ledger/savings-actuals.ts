import { savingRoles, today, validDate, type Ledger } from "./model.ts";

export function savingsActuals(
  data: Ledger,
  month = today().slice(0, 7),
  asOf = today(),
) {
  const start = `${month}-01`;
  if (
    !/^20\d{2}-\d{2}$/.test(month) ||
    !validDate(start) ||
    !validDate(asOf) ||
    start > asOf
  )
    throw new Error("오늘까지의 조회 월을 선택해 주세요.");
  const end =
    month === asOf.slice(0, 7)
      ? asOf
      : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
          .toISOString()
          .slice(0, 10);
  const plan = data.monthlyPlan;
  const accounts = data.accounts.filter(
    (a) =>
      savingRoles.includes(a.role) &&
      a.id !== plan?.salaryAccountId &&
      !(plan && plan.fixedAmount > 0 && a.id === plan.fixedAccountId) &&
      !(plan && plan.livingAmount > 0 && a.id === plan.livingAccountId),
  );
  const eligible = new Set(accounts.map((a) => a.id));
  const entries = data.entries.filter(
    (e) => e.kind === "TRANSFER" && e.date >= start && e.date <= end,
  );
  const sum = (ids: string[], planned: number) => {
    const selected = entries.filter((e) => ids.includes(e.accountId));
    const net = selected.reduce((total, e) => total + e.amount, 0);
    const unpaired = selected.filter((e) => !e.pairId).length;
    const partial = ids.some(
      (id) =>
        (data.accounts.find((a) => a.id === id)?.openingDate ?? "9999") > start,
    );
    return {
      planned,
      net,
      unpaired,
      partial,
      count: selected.length,
      remaining: unpaired || partial ? null : Math.max(0, planned - net),
    };
  };
  const accountRows = accounts.map((account) => ({
    account,
    ...sum(
      [account.id],
      plan?.allocations.find((a) => a.accountId === account.id)?.amount ?? 0,
    ),
  }));
  const goalRows = data.goals.map((goal) => {
    const supported = goal.accountIds.every((id) => eligible.has(id));
    const planned = plan
      ? plan.allocations
          .filter((a) => goal.accountIds.includes(a.accountId))
          .reduce((n, a) => n + a.amount, 0)
      : goal.monthly;
    return { goal, supported, ...sum(goal.accountIds, planned) };
  });
  return {
    start,
    end,
    accountRows,
    goalRows,
    total: sum(
      [...eligible],
      accountRows.reduce((n, a) => n + a.planned, 0),
    ),
  };
}
