import {
  goalMetrics,
  goalUsesSpendingAccount,
  planRemainder,
  today,
  validDate,
  validateMonthlyPlan,
  type Ledger,
} from "./model.ts";

export function salaryCycle(payday: number, asOf = today()) {
  if (
    !validDate(asOf) ||
    !Number.isInteger(payday) ||
    payday < 1 ||
    payday > 31
  )
    throw new Error("월급날과 계산 기준일을 확인해 주세요.");
  const date = new Date(`${asOf}T00:00:00Z`);
  const paydayAt = (offset: number) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + offset;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(payday, last)))
      .toISOString()
      .slice(0, 10);
  };
  const current = paydayAt(0);
  return current <= asOf
    ? { start: current, next: paydayAt(1) }
    : { start: paydayAt(-1), next: current };
}

export function monthlyMetrics(data: Ledger, asOf = today()) {
  const plan = data.monthlyPlan;
  if (!plan) return null;
  validateMonthlyPlan(plan, data.accounts);
  const capacity =
    plan.netIncome - plan.fixedAmount - plan.livingAmount - plan.reserveAmount;
  const savings = plan.allocations.reduce((sum, a) => sum + a.amount, 0);
  const remainder = planRemainder(plan);
  const deficit = Math.max(0, -remainder);
  const unassigned = Math.max(0, remainder);
  const routes = new Map<
    string,
    { accountId: string; amount: number; purposes: string[]; transfer: boolean }
  >();
  const add = (accountId: string | null, amount: number, purpose: string) => {
    if (!accountId || !amount) return;
    const route = routes.get(accountId) ?? {
      accountId,
      amount: 0,
      purposes: [],
      transfer: accountId !== plan.salaryAccountId,
    };
    route.amount += amount;
    route.purposes.push(purpose);
    routes.set(accountId, route);
  };
  add(plan.fixedAccountId, plan.fixedAmount, "고정비");
  add(plan.livingAccountId, plan.livingAmount, "생활비");
  add(plan.salaryAccountId, plan.reserveAmount, "비상 예비비");
  for (const allocation of plan.allocations)
    add(allocation.accountId, allocation.amount, "저축·투자");
  add(plan.salaryAccountId, unassigned, "미배정");

  const goals = data.goals.map((goal) => {
    const metrics = goalMetrics(goal, data, asOf);
    const includesSpending = goalUsesSpendingAccount(goal, plan);
    const status = includesSpending
      ? "spending"
      : !metrics
        ? "unknown"
        : metrics.remaining === 0
          ? "achieved"
          : metrics.needed === null
            ? "overdue"
            : metrics.gap! > 0
              ? "shortfall"
              : "funded";
    return { goal, metrics, status };
  });
  const unresolved = goals.some((g) =>
    ["spending", "unknown", "overdue"].includes(g.status),
  );
  // Surplus assigned to one goal is never silently reused for a different goal.
  const goalGap = unresolved
    ? null
    : goals.reduce((sum, g) => sum + (g.metrics?.gap ?? 0), 0);
  const additionalIncome =
    goalGap === null ? null : deficit + Math.max(0, goalGap - unassigned);
  return {
    capacity,
    savings,
    remainder,
    deficit,
    unassigned,
    assigned:
      plan.fixedAmount + plan.livingAmount + plan.reserveAmount + savings,
    routes: [...routes.values()],
    goals,
    goalGap,
    additionalIncome,
    cycle: salaryCycle(plan.payday, asOf),
  };
}
